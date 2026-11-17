#!/usr/bin/env python3
"""
GP Connect - GlobalProtect VPN Client
Web UI wrapper around gpclient (GlobalProtect-openconnect by yuezk).

Workflow (same as the original GP Connect app):
  1. User only enters the portal URL
  2. gpclient authenticates automatically:
     - SAML/SSO portals (e.g. sasa.telkomsel.co.id): opens a browser login window
     - Password portals: prompts for username/password (relayed to this UI)
  3. Gateway is selected automatically (--auto-gateway)
  4. VPN tunnel is established
"""
import os
import re
import pty
import select
import shlex
import signal
import subprocess
import threading
import time
from datetime import datetime

from flask import Flask, render_template, request, jsonify

app = Flask(__name__)
app.secret_key = os.urandom(24)

GPCLIENT = shlex.quote('/usr/bin/gpclient')

vpn_state = {
    'connected': False,
    'status': 'disconnected',   # disconnected | connecting | connected
    'portal': None,
    'process': None,            # subprocess.Popen
    'master_fd': None,          # pty master fd
    'prompt': None,             # {'text': ..., 'type': 'text'|'password'}
    'log': [],
}
state_lock = threading.Lock()


def log_message(message, level='info'):
    timestamp = datetime.now().strftime('%H:%M:%S')
    entry = {'timestamp': timestamp, 'level': level, 'message': message}
    with state_lock:
        vpn_state['log'].append(entry)
        if len(vpn_state['log']) > 500:
            vpn_state['log'] = vpn_state['log'][-500:]
    print(f"[{timestamp}] [{level.upper()}] {message}", flush=True)


ANSI_RE = re.compile(r'\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07|\r')


def clean_output(raw):
    """Strip ANSI escapes / carriage returns from pty output."""
    text = ANSI_RE.sub('', raw)
    return text.strip()


def parse_level(line):
    """gpclient text logs look like: [2026-11-17T10:30:00Z INFO ] message"""
    if ' ERROR ' in line or line.startswith('error'):
        return 'error'
    if ' WARN ' in line or line.startswith('warn'):
        return 'warning'
    if ' DEBUG ' in line or line.startswith('debug'):
        return 'info'
    if ' TRACE ' in line:
        return 'info'
    return 'info'


def classify_prompt(text):
    lowered = text.lower()
    if 'password' in lowered or 'passcode' in lowered or 'otp' in lowered or 'mfa' in lowered:
        return 'password'
    if 'user' in lowered or 'email' in lowered or 'account' in lowered:
        return 'text'
    return 'text'


def run_gpclient(portal):
    master_fd, slave_fd = pty.openpty()
    cmd = [
        'sudo', '-n', 'gpclient', 'connect', portal,
        '--browser',
        '--auto-gateway',
        '--cookie-cache',
    ]

    log_message(f"Starting: {' '.join(cmd[1:])}")

    try:
        proc = subprocess.Popen(
            cmd,
            stdin=slave_fd,
            stdout=slave_fd,
            stderr=slave_fd,
            close_fds=True,
            start_new_session=True,
        )
    except Exception as e:
        log_message(f"Failed to launch gpclient: {e}", 'error')
        vpn_state['status'] = 'disconnected'
        return

    os.close(slave_fd)
    with state_lock:
        vpn_state['process'] = proc
        vpn_state['master_fd'] = master_fd

    buffer = b''

    def emit(raw_line):
        line = clean_output(raw_line.decode('utf-8', errors='replace'))
        if not line:
            return
        log_message(line, parse_level(line))

        # Detect successful connection
        lowered = line.lower()
        if re.search(r'\b(connected|established)\b', lowered) \
                and 'disconnected' not in lowered \
                and 'reconnect' not in lowered \
                and 'not connected' not in lowered:
            with state_lock:
                vpn_state['connected'] = True
                vpn_state['status'] = 'connected'
            log_message("VPN tunnel is up", 'success')

        # Detect SSO window
        if 'saml' in lowered or 'sso' in lowered or 'browser' in lowered:
            if 'open' in lowered or 'login' in lowered or 'auth' in lowered:
                log_message("Complete the login in the opened browser window", 'warning')

    try:
        while True:
            readable, _, _ = select.select([master_fd], [], [], 0.5)
            if master_fd in readable:
                try:
                    data = os.read(master_fd, 4096)
                except OSError:
                    break
                if not data:
                    break
                buffer += data
                while b'\n' in buffer:
                    line_bytes, buffer = buffer.split(b'\n', 1)
                    emit(line_bytes)

                # Interactive prompt (no trailing newline yet)
                tail = clean_output(buffer.decode('utf-8', errors='replace'))
                stripped = tail.strip()
                if stripped.endswith(':') and 0 < len(stripped) <= 80:
                    with state_lock:
                        vpn_state['prompt'] = {
                            'text': stripped,
                            'type': classify_prompt(stripped),
                        }
                    log_message(f"Waiting for input: {stripped}", 'warning')
                elif vpn_state['prompt'] and stripped:
                    # Prompt text changed (e.g. user typed), update
                    pass

            # Process exited?
            if vpn_state['process'] and vpn_state['process'].poll() is not None and master_fd not in readable:
                break

        # Flush remaining output
        if buffer:
            emit(buffer)

        returncode = vpn_state['process'].poll() if vpn_state['process'] else None
        if vpn_state['status'] != 'connected':
            if returncode not in (0, None):
                log_message(f"gpclient exited with code {returncode}", 'error')
                log_message("Check the Logs tab for details. Common issues: missing sudoers rule, "
                            "wrong portal address, or the portal rejected the login.", 'error')
            else:
                log_message("gpclient exited", 'info')
        else:
            log_message("gpclient process ended, VPN is down", 'warning')

    except Exception as e:
        log_message(f"Monitor error: {e}", 'error')
    finally:
        try:
            os.close(master_fd)
        except OSError:
            pass
        with state_lock:
            vpn_state['connected'] = False
            vpn_state['status'] = 'disconnected'
            vpn_state['process'] = None
            vpn_state['master_fd'] = None
            vpn_state['prompt'] = None


def sudo_gpclient_works():
    """Return True when `sudo -n gpclient` can run without a password."""
    try:
        res = subprocess.run(['sudo', '-n', 'gpclient', '--version'],
                             capture_output=True, timeout=5)
        return res.returncode == 0
    except Exception:
        return False


# ---------- Routes ----------

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/check_openconnect')
def check_tools():
    gpclient_ok = bool(subprocess.run(['which', 'gpclient'], capture_output=True).returncode == 0)
    openconnect_ok = bool(subprocess.run(['which', 'openconnect'], capture_output=True).returncode == 0)
    return jsonify({
        'installed': gpclient_ok and openconnect_ok,
        'gpclient': gpclient_ok,
        'openconnect': openconnect_ok,
        'sudo_ok': sudo_gpclient_works(),
    })


@app.route('/api/connect', methods=['POST'])
def connect():
    data = request.get_json(silent=True) or {}
    portal = (data.get('portal') or '').strip()

    if not portal:
        return jsonify({'success': False, 'message': 'Portal address is required'})

    # Normalize: drop scheme and trailing slash, gpclient accepts bare hostnames
    portal = re.sub(r'^https?://', '', portal).strip().rstrip('/')
    vpn_state['portal'] = portal

    with state_lock:
        busy = vpn_state['process'] is not None

    if busy:
        return jsonify({'success': False,
                        'message': 'A connection attempt is already in progress'})

    if not sudo_gpclient_works():
        return jsonify({
            'success': False,
            'message': 'Passwordless sudo for gpclient is not configured. Run once in a terminal: '
                       'echo "%sudo ALL=(ALL) NOPASSWD: /usr/sbin/openconnect, /usr/bin/gpclient, /usr/bin/gpauth" '
                       '| sudo tee /etc/sudoers.d/globalprotect-openconnect'
        })

    vpn_state['log'] = []
    vpn_state['status'] = 'connecting'
    vpn_state['connected'] = False
    vpn_state['prompt'] = None

    threading.Thread(target=run_gpclient, args=(portal,), daemon=True).start()

    return jsonify({
        'success': True,
        'message': 'Connecting... a browser window will open if your portal uses SSO/SAML',
        'portal': portal,
    })


@app.route('/api/respond_prompt', methods=['POST'])
def respond_prompt():
    data = request.get_json(silent=True) or {}
    value = data.get('value', '')
    with state_lock:
        fd = vpn_state['master_fd']
        prompt = vpn_state['prompt']
        vpn_state['prompt'] = None
    if fd is None or prompt is None:
        return jsonify({'success': False, 'message': 'No prompt is active'})
    try:
        os.write(fd, (value + '\n').encode())
        log_message("Credentials submitted", 'info')
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


@app.route('/api/disconnect', methods=['POST'])
def disconnect():
    # Preferred: ask the running gpclient instance to disconnect
    try:
        subprocess.run(['sudo', '-n', 'gpclient', 'disconnect'],
                       capture_output=True, timeout=15)
    except Exception:
        pass

    with state_lock:
        proc = vpn_state['process']
        vpn_state['process'] = None
        vpn_state['master_fd'] = None
        vpn_state['prompt'] = None

    if proc and proc.poll() is None:
        try:
            os.killpg(proc.pid, signal.SIGTERM)
            for _ in range(20):
                if proc.poll() is not None:
                    break
                time.sleep(0.1)
            if proc.poll() is None:
                os.killpg(proc.pid, signal.SIGKILL)
        except Exception:
            pass

    vpn_state['connected'] = False
    vpn_state['status'] = 'disconnected'
    log_message('VPN disconnected', 'info')
    return jsonify({'success': True})


@app.route('/api/status')
def status():
    with state_lock:
        proc = vpn_state['process']
        # Self-heal: if the process died but UI thinks we are connected
        if proc is None and vpn_state['status'] != 'disconnected' and not vpn_state['connected']:
            vpn_state['status'] = 'disconnected'
        return jsonify({
            'connected': vpn_state['connected'],
            'status': vpn_state['status'],
            'portal': vpn_state['portal'],
            'prompt': vpn_state['prompt'],
            'log': vpn_state['log'][-100:],
        })


@app.route('/api/clear_logs', methods=['POST'])
def clear_logs():
    vpn_state['log'] = []
    return jsonify({'success': True})


if __name__ == '__main__':
    print("=" * 60)
    print("GP Connect - GlobalProtect VPN Client")
    print("=" * 60)
    print("\nStarting web server on http://localhost:5000")
    print("\nOne-time system setup (if not done yet):")
    print("  ./setup.sh")
    print("  # or manually:")
    print('  echo "%sudo ALL=(ALL) NOPASSWD: /usr/sbin/openconnect, /usr/bin/gpclient, /usr/bin/gpauth" '
          '| sudo tee /etc/sudoers.d/globalprotect-openconnect')
    print("\nPress Ctrl+C to stop the server")
    print("=" * 60)
    app.run(host='127.0.0.1', port=5000, debug=False)

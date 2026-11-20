/**
 * GP Connect - GlobalProtect VPN Client
 * Web UI wrapper around gpclient (GlobalProtect-openconnect by yuezk).
 *
 * Workflow (same as the original GP Connect app):
 *   1. User only enters the portal URL
 *   2. gpclient authenticates automatically:
 *      - SAML/SSO portals (e.g. xxxx-xx-xx.com): opens a browser login window
 *      - Password portals: prompts for username/password (relayed to this UI)
 *   3. Gateway is selected automatically (--auto-gateway)
 *   4. VPN tunnel is established
 */

import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { Database } from 'bun:sqlite';
import { execSync } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const app = new Hono();

// Database initialization
const DB_PATH = process.env.NODE_ENV === 'test' 
  ? path.join(import.meta.dir, 'test_portals.db')
  : path.join(import.meta.dir, 'portals.db');
const db = new Database(DB_PATH);

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS portals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE
    )
  `);
}

initDb();

// VPN state management
interface Prompt {
  text: string;
  type: 'text' | 'password';
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

interface VPNState {
  connected: boolean;
  status: 'disconnected' | 'connecting' | 'connected';
  portal: string | null;
  process: ReturnType<typeof Bun.spawn> | null;
  terminal: InstanceType<typeof Bun.Terminal> | null;
  prompt: Prompt | null;
  log: LogEntry[];
}

const vpnState: VPNState = {
  connected: false,
  status: 'disconnected',
  portal: null,
  process: null,
  terminal: null,
  prompt: null,
  log: [],
};

const ANSI_RE = /\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07|\r/g;

function cleanOutput(raw: string): string {
  return raw.replace(ANSI_RE, '').trim();
}

function logMessage(message: string, level: 'info' | 'error' | 'warning' | 'success' = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const entry: LogEntry = { timestamp, level, message };
  vpnState.log.push(entry);
  if (vpnState.log.length > 500) {
    vpnState.log = vpnState.log.slice(-500);
  }
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
}

function parseLevel(line: string): string {
  const lower = line.toLowerCase();
  if (lower.includes(' ERROR ') || lower.startsWith('error')) return 'error';
  if (lower.includes(' WARN ') || lower.startsWith('warn')) return 'warning';
  if (lower.includes(' DEBUG ') || lower.includes(' TRACE ')) return 'info';
  return 'info';
}

function classifyPrompt(text: string): 'text' | 'password' {
  const lower = text.toLowerCase();
  if (lower.includes('password') || lower.includes('passcode') || lower.includes('otp') || lower.includes('mfa')) {
    return 'password';
  }
  return 'text';
}

function normalizeUrl(url: string): string {
  url = (url || '').trim();
  url = url.replace(/^https?:\/\//i, '');
  return url.replace(/\/$/, '').trim();
}

async function sudoGpclientWorks(): Promise<boolean> {
  try {
    const result = Bun.spawnSync(['sudo', '-n', 'gpclient', '--version']);
    return result.success;
  } catch {
    return false;
  }
}

function runGpclient(portal: string) {
  return new Promise<void>(async (resolve) => {
    try {
      const cmd = ['sudo', '-n', 'gpclient', 'connect', portal, '--browser', '--auto-gateway', '--cookie-cache'];

      logMessage(`Starting: ${cmd.slice(1).join(' ')}`);

      const terminal = new Bun.Terminal({
        rows: 24,
        cols: 80,
      });

      const proc = Bun.spawn(cmd, {
        terminal,
        stdio: ['inherit', 'inherit', 'inherit'],
      });

      vpnState.process = proc;
      vpnState.terminal = terminal;

      let buffer = '';

      const reader = terminal.readable.getReader();

      async function readLoop() {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = new TextDecoder().decode(value);
            buffer += text;

            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const rawLine of lines) {
              const line = cleanOutput(rawLine);
              if (!line) continue;

              logMessage(line, parseLevel(line) as any);

              // Detect successful connection
              const lower = line.toLowerCase();
              if (/\b(connected|established)\b/.test(lower) && !lower.includes('disconnected') && !lower.includes('reconnect') && !lower.includes('not connected')) {
                vpnState.connected = true;
                vpnState.status = 'connected';
                logMessage('VPN tunnel is up', 'success');
              }

              // Detect SSO window
              if ((lower.includes('saml') || lower.includes('sso') || lower.includes('browser')) && (lower.includes('open') || lower.includes('login') || lower.includes('auth'))) {
                logMessage('Complete the login in the opened browser window', 'warning');
              }
            }

            // Check for interactive prompt
            const tail = cleanOutput(buffer);
            if (tail.endsWith(':') && tail.length > 0 && tail.length <= 80) {
              vpnState.prompt = {
                text: tail,
                type: classifyPrompt(tail),
              };
              logMessage(`Waiting for input: ${tail}`, 'warning');
            }
          }
        } catch (e) {
          logMessage(`Read error: ${e}`, 'error');
        }
      }

      // Start reading
      readLoop();

      // Wait for process exit
      const exitCode = await proc.exited;

      if (vpnState.status !== 'connected') {
        if (exitCode !== 0) {
          logMessage(`gpclient exited with code ${exitCode}`, 'error');
          logMessage('Check the Logs tab for details. Common issues: missing sudoers rule, wrong portal address, or the portal rejected the login.', 'error');
        } else {
          logMessage('gpclient exited', 'info');
        }
      } else {
        logMessage('gpclient process ended, VPN is down', 'warning');
      }

      vpnState.connected = false;
      vpnState.status = 'disconnected';
      vpnState.process = null;
      vpnState.terminal = null;
      vpnState.prompt = null;

      resolve();
    } catch (e) {
      logMessage(`Failed to launch gpclient: ${e}`, 'error');
      vpnState.status = 'disconnected';
      resolve();
    }
  });
}

// Routes

// Serve static files
app.use('/static/*', serveStatic({ root: import.meta.dir }));

// Main page
app.get('/', (c) => {
  return c.html(fs.readFileSync(path.join(import.meta.dir, 'templates/index.html'), 'utf-8'));
});

// API: List portals
app.get('/api/portals', (c) => {
  try {
    const rows = db.query('SELECT id, name, url FROM portals ORDER BY name COLLATE NOCASE ASC').all();
    return c.json({ success: true, portals: rows });
  } catch (e) {
    return c.json({ success: false, message: String(e) }, 500);
  }
});

// API: Create portal
app.post('/api/portals', async (c) => {
  try {
    const data = await c.req.json();
    const name = ((data.name as string) || '').trim();
    const rawUrl = ((data.url as string) || '').trim();
    const url = normalizeUrl(rawUrl);

    if (!url) {
      return c.json({ success: false, message: 'Portal URL is required' }, 400);
    }

    const finalName = name || url;

    try {
      const result = db.query('INSERT INTO portals (name, url) VALUES (?, ?)').run(finalName, url);
      const row = db.query('SELECT id, name, url FROM portals WHERE id = ?').get(result.lastInsertRowid);
      return c.json({ success: true, portal: row }, 201);
    } catch (e) {
      if (String(e).includes('UNIQUE')) {
        return c.json({ success: false, message: 'A portal with this URL already exists' }, 409);
      }
      throw e;
    }
  } catch (e) {
    return c.json({ success: false, message: String(e) }, 500);
  }
});

// API: Update portal
app.put('/api/portals/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const data = await c.req.json();
    const name = ((data.name as string) || '').trim();
    const rawUrl = ((data.url as string) || '').trim();
    const url = normalizeUrl(rawUrl);

    if (!url) {
      return c.json({ success: false, message: 'Portal URL is required' }, 400);
    }

    const finalName = name || url;

    try {
      const result = db.query('UPDATE portals SET name = ?, url = ? WHERE id = ?').run(finalName, url, id);
      if ((result.changes ?? 0) === 0) {
        return c.json({ success: false, message: 'Portal not found' }, 404);
      }
      const row = db.query('SELECT id, name, url FROM portals WHERE id = ?').get(id);
      return c.json({ success: true, portal: row });
    } catch (e) {
      if (String(e).includes('UNIQUE')) {
        return c.json({ success: false, message: 'A portal with this URL already exists' }, 409);
      }
      throw e;
    }
  } catch (e) {
    return c.json({ success: false, message: String(e) }, 500);
  }
});

// API: Delete portal
app.delete('/api/portals/:id', (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const result = db.query('DELETE FROM portals WHERE id = ?').run(id);
    if ((result.changes ?? 0) === 0) {
      return c.json({ success: false, message: 'Portal not found' }, 404);
    }
    return c.json({ success: true });
  } catch (e) {
    return c.json({ success: false, message: String(e) }, 500);
  }
});

// API: Check tools
app.get('/api/check_openconnect', async (c) => {
  const gpclientOk = Bun.spawnSync(['which', 'gpclient']).success;
  const openconnectOk = Bun.spawnSync(['which', 'openconnect']).success;
  const sudoOk = await sudoGpclientWorks();

  return c.json({
    installed: gpclientOk && openconnectOk,
    gpclient: gpclientOk,
    openconnect: openconnectOk,
    sudo_ok: sudoOk,
  });
});

// API: Connect
app.post('/api/connect', async (c) => {
  try {
    const data = await c.req.json();
    const portal = ((data.portal as string) || '').trim();

    if (!portal) {
      return c.json({ success: false, message: 'Portal address is required' });
    }

    const normalizedPortal = normalizeUrl(portal);
    vpnState.portal = normalizedPortal;

    if (vpnState.process !== null) {
      return c.json({
        success: false,
        message: 'A connection attempt is already in progress',
      });
    }

    if (!(await sudoGpclientWorks())) {
      return c.json({
        success: false,
        message:
          'Passwordless sudo for gpclient is not configured. Run once in a terminal: echo "%sudo ALL=(ALL) NOPASSWD: /usr/sbin/openconnect, /usr/bin/gpclient, /usr/bin/gpauth" | sudo tee /etc/sudoers.d/globalprotect-openconnect',
      });
    }

    vpnState.log = [];
    vpnState.status = 'connecting';
    vpnState.connected = false;
    vpnState.prompt = null;

    // Start connection in background
    runGpclient(normalizedPortal);

    return c.json({
      success: true,
      message: 'Connecting... a browser window will open if your portal uses SSO/SAML',
      portal: normalizedPortal,
    });
  } catch (e) {
    return c.json({ success: false, message: String(e) }, 500);
  }
});

// API: Respond to prompt
app.post('/api/respond_prompt', async (c) => {
  try {
    const data = await c.req.json();
    const value = (data.value as string) || '';

    if (!vpnState.terminal || !vpnState.prompt) {
      return c.json({ success: false, message: 'No prompt is active' });
    }

    vpnState.terminal.write(`${value}\n`);
    vpnState.prompt = null;
    logMessage('Credentials submitted', 'info');

    return c.json({ success: true });
  } catch (e) {
    return c.json({ success: false, message: String(e) }, 500);
  }
});

// API: Disconnect
app.post('/api/disconnect', async (c) => {
  try {
    // Try to disconnect gracefully
    try {
      Bun.spawnSync(['sudo', '-n', 'gpclient', 'disconnect'], { timeout: 15000 });
    } catch {}

    // Kill process if still running
    if (vpnState.process) {
      if (vpnState.process.pid) {
        try {
          Bun.spawnSync(['kill', '-15', String(vpnState.process.pid)]);
          // Give it time to shut down
          await new Promise((r) => setTimeout(r, 200));
          if (vpnState.process.pid) {
            Bun.spawnSync(['kill', '-9', String(vpnState.process.pid)]);
          }
        } catch {}
      }
    }

    vpnState.connected = false;
    vpnState.status = 'disconnected';
    vpnState.process = null;
    vpnState.terminal = null;
    vpnState.prompt = null;

    logMessage('VPN disconnected', 'info');
    return c.json({ success: true });
  } catch (e) {
    return c.json({ success: false, message: String(e) }, 500);
  }
});

// API: Status
app.get('/api/status', (c) => {
  // Self-heal: if process died but UI thinks we're connected
  if (vpnState.process === null && vpnState.status !== 'disconnected' && !vpnState.connected) {
    vpnState.status = 'disconnected';
  }

  return c.json({
    connected: vpnState.connected,
    status: vpnState.status,
    portal: vpnState.portal,
    prompt: vpnState.prompt,
    log: vpnState.log.slice(-100),
  });
});

// API: Clear logs
app.post('/api/clear_logs', (c) => {
  vpnState.log = [];
  return c.json({ success: true });
});

// Print startup banner
console.log('='.repeat(60));
console.log('GP Connect - GlobalProtect VPN Client');
console.log('='.repeat(60));
console.log('\nStarting web server on http://localhost:5000');
console.log('\nOne-time system setup (if not done yet):');
console.log('  ./setup.sh');
console.log('  # or manually:');
console.log('  echo "%sudo ALL=(ALL) NOPASSWD: /usr/sbin/openconnect, /usr/bin/gpclient, /usr/bin/gpauth" | sudo tee /etc/sudoers.d/globalprotect-openconnect');
console.log('\nPress Ctrl+C to stop the server');
console.log('='.repeat(60));

export default {
  port: 5000,
  hostname: '127.0.0.1',
  fetch: app.fetch,
};

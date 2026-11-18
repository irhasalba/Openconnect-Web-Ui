/**
 * GP Connect - Frontend
 * Workflow: Enter portal URL only → gpclient handles auth, gateway and tunnel
 */

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initToolCheck();
    initPolling();
    loadSavedPortal();
    loadPortals();
});

// ---------- Navigation ----------
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetView = item.dataset.view;

            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
            document.getElementById(`view-${targetView}`).classList.add('active');
        });
    });
}

// ---------- Tool check ----------
async function initToolCheck() {
    try {
        const resp = await fetch('/api/check_openconnect');
        const data = await resp.json();

        const badge = document.getElementById('openconnectBadge');
        const statusText = document.getElementById('openconnectStatus');
        const warning = document.getElementById('openconnectWarning');

        if (data.installed && data.sudo_ok) {
            badge.textContent = 'Ready';
            badge.className = 'badge ok';
            statusText.textContent = 'gpclient and openconnect are installed, sudo is ready';
            warning.classList.add('hidden');
        } else if (data.installed) {
            badge.textContent = 'Setup needed';
            badge.className = 'badge fail';
            statusText.textContent = 'Passwordless sudo for gpclient is not configured';
            warning.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <div>
                    <strong>One-time setup required</strong>
                    <p>Run in a terminal:</p>
                    <pre><code>./setup.sh</code></pre>
                </div>`;
            warning.classList.remove('hidden');
        } else {
            badge.textContent = 'Missing';
            badge.className = 'badge fail';
            statusText.textContent = 'gpclient or openconnect is not installed';
            warning.classList.remove('hidden');
        }
    } catch (e) {
        console.error('Failed to check tools:', e);
    }
}

// ---------- Saved portals ----------
function renderRecent() {
    const recent = JSON.parse(localStorage.getItem('gp_recent_portals') || '[]');
    const container = document.getElementById('recentPortals');
    if (!container) return;
    container.innerHTML = recent.length
        ? recent.map(p => `<div style="padding: 4px 0;">• ${escapeHtml(p)}</div>`).join('')
        : 'None';
}

function loadSavedPortal() {
    const savedPortal = localStorage.getItem('gp_last_portal');
    if (savedPortal) document.getElementById('portal').value = savedPortal;
    renderRecent();
}

function savePortal(portal) {
    localStorage.setItem('gp_last_portal', portal);

    let recent = JSON.parse(localStorage.getItem('gp_recent_portals') || '[]');
    recent = recent.filter(p => p !== portal);
    recent.unshift(portal);
    recent = recent.slice(0, 5);
    localStorage.setItem('gp_recent_portals', JSON.stringify(recent));
    renderRecent();
}

// ---------- Portal CRUD (SQLite-backed) ----------
let savedPortals = [];
let editingPortalId = null;

async function loadPortals() {
    try {
        const resp = await fetch('/api/portals');
        const data = await resp.json();
        savedPortals = (data && data.success) ? data.portals : [];
    } catch (e) {
        console.error('Failed to load portals:', e);
        savedPortals = [];
    }
    renderPortalDropdown();
    renderPortalManagerList();
}

function renderPortalDropdown() {
    const select = document.getElementById('portalDropdown');
    if (!select) return;
    const current = select.value;
    let html = '<option value="">-- Select Saved Portal --</option>';
    savedPortals.forEach(p => {
        html += `<option value="${escapeHtml(p.url)}">${escapeHtml(p.name || p.url)}</option>`;
    });
    select.innerHTML = html;

    const savedPortal = localStorage.getItem('gp_last_portal');
    const match = savedPortals.find(p => p.url === savedPortal);
    if (match) {
        select.value = match.url;
    } else if (current && savedPortals.some(p => p.url === current)) {
        select.value = current;
    }
}

function onPortalSelectChange() {
    const select = document.getElementById('portalDropdown');
    const url = select.value;
    if (!url) return;
    const input = document.getElementById('portal');
    if (input) input.value = url;
    // Make sure the portal form is visible so the user can hit Connect
    showPortalInput();
}

function openPortalManager() {
    resetPortalForm();
    renderPortalManagerList();
    document.getElementById('portalManagerModal').classList.remove('hidden');
}

function closePortalManager() {
    document.getElementById('portalManagerModal').classList.add('hidden');
}

function renderPortalManagerList() {
    const container = document.getElementById('portalList');
    if (!container) return;
    if (!savedPortals.length) {
        container.innerHTML = '<div class="empty-state">No saved portals yet.</div>';
        return;
    }
    container.innerHTML = savedPortals.map(p => `
        <div class="portal-item">
            <div class="portal-item-info">
                <div class="portal-item-name">${escapeHtml(p.name || p.url)}</div>
                <div class="portal-item-url">${escapeHtml(p.url)}</div>
            </div>
            <div class="portal-item-actions">
                <button class="btn btn-secondary btn-sm" onclick="editPortal(${p.id})">Edit</button>
                <button class="btn btn-danger btn-sm" onclick="deletePortal(${p.id})">Delete</button>
            </div>
        </div>
    `).join('');
}

function resetPortalForm() {
    editingPortalId = null;
    document.getElementById('portalName').value = '';
    document.getElementById('portalUrl').value = '';
    document.getElementById('portalFormSubmitBtn').textContent = 'Add Portal';
}

function editPortal(id) {
    const portal = savedPortals.find(p => p.id === id);
    if (!portal) return;
    editingPortalId = id;
    document.getElementById('portalName').value = portal.name || '';
    document.getElementById('portalUrl').value = portal.url || '';
    document.getElementById('portalFormSubmitBtn').textContent = 'Update Portal';
    document.getElementById('portalName').focus();
}

async function deletePortal(id) {
    const portal = savedPortals.find(p => p.id === id);
    const label = portal ? (portal.name || portal.url) : `#${id}`;
    if (!confirm(`Delete portal "${label}"?`)) return;

    try {
        const resp = await fetch(`/api/portals/${id}`, { method: 'DELETE' });
        const data = await resp.json();
        if (!data.success) {
            showToast(data.message || 'Failed to delete portal', 'error');
            return;
        }
        showToast('Portal deleted', 'info');
        if (editingPortalId === id) resetPortalForm();
        await loadPortals();
    } catch (e) {
        showToast('Error deleting portal: ' + e.message, 'error');
    }
}

async function savePortalFromForm() {
    const name = document.getElementById('portalName').value.trim();
    const url = document.getElementById('portalUrl').value.trim();

    if (!url) {
        showToast('Portal URL is required', 'error');
        return;
    }

    const isEdit = editingPortalId !== null;
    const endpoint = isEdit ? `/api/portals/${editingPortalId}` : '/api/portals';
    const method = isEdit ? 'PUT' : 'POST';

    try {
        const resp = await fetch(endpoint, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, url })
        });
        const data = await resp.json();
        if (!data.success) {
            showToast(data.message || 'Failed to save portal', 'error');
            return;
        }
        showToast(isEdit ? 'Portal updated' : 'Portal added', 'success');
        resetPortalForm();
        await loadPortals();
    } catch (e) {
        showToast('Error saving portal: ' + e.message, 'error');
    }
}

// Close modal on backdrop click or ESC
document.addEventListener('click', (event) => {
    const modal = document.getElementById('portalManagerModal');
    if (event.target === modal) closePortalManager();
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        const modal = document.getElementById('portalManagerModal');
        if (modal && !modal.classList.contains('hidden')) closePortalManager();
    }
});

// ---------- UI state ----------
function showPortalInput() {
    document.getElementById('mainActionBtn').classList.add('hidden');
    document.getElementById('loadingState').classList.add('hidden');
    document.getElementById('promptBox').classList.add('hidden');
    document.getElementById('portalForm').classList.remove('hidden');
    document.getElementById('portal').focus();
    document.getElementById('portal').select();
}

function cancelConnection() {
    document.getElementById('portalForm').classList.add('hidden');
    document.getElementById('loadingState').classList.add('hidden');
    document.getElementById('promptBox').classList.add('hidden');
    document.getElementById('mainActionBtn').classList.remove('hidden');
}

// ---------- Connect ----------
async function startConnection() {
    const portal = document.getElementById('portal').value.trim();

    if (!portal) {
        showToast('Please enter a portal address', 'error');
        return;
    }

    document.getElementById('portalForm').classList.add('hidden');
    document.getElementById('mainActionBtn').classList.add('hidden');
    document.getElementById('loadingState').classList.remove('hidden');
    document.getElementById('loadingText').textContent = `Connecting to ${portal}...`;

    try {
        const resp = await fetch('/api/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ portal })
        });

        const data = await resp.json();

        if (!data.success) {
            document.getElementById('loadingState').classList.add('hidden');
            showToast(data.message || 'Failed to start connection', 'error');
            showPortalInput();
            return;
        }

        savePortal(data.portal);
        document.getElementById('loadingText').textContent = 'Waiting for authentication...';
        showToast('A browser window will open if your portal uses SSO/SAML', 'info');
    } catch (e) {
        document.getElementById('loadingState').classList.add('hidden');
        showToast('Network error: ' + e.message, 'error');
        showPortalInput();
        console.error(e);
    }
}

async function handleDisconnect() {
    try {
        const resp = await fetch('/api/disconnect', { method: 'POST' });
        const data = await resp.json();
        if (data.success) {
            showToast('Disconnected from VPN', 'info');
        } else {
            showToast(data.message || 'Disconnect failed', 'error');
        }
    } catch (e) {
        showToast('Error disconnecting', 'error');
    }
}

// ---------- Status polling ----------
function initPolling() {
    setInterval(async () => {
        const autoRefresh = document.getElementById('autoRefresh');
        if (autoRefresh && !autoRefresh.checked) return;

        try {
            const resp = await fetch('/api/status');
            const data = await resp.json();
            updateUI(data);
        } catch (e) {
            // ignore polling errors
        }
    }, 1000);
}

function updateUI(data) {
    const badge = document.getElementById('statusBadge');
    const statusText = document.getElementById('connectionStatus');
    const icon = document.getElementById('connectionIcon');
    const info = document.getElementById('connectionInfo');
    const mainBtn = document.getElementById('mainActionBtn');
    const loadingState = document.getElementById('loadingState');
    const promptBox = document.getElementById('promptBox');

    // Interactive prompt (username/password for non-SAML portals)
    if (data.prompt) {
        showPrompt(data.prompt);
    } else {
        promptBox.classList.add('hidden');
    }

    if (data.status === 'connected') {
        badge.className = 'status-badge connected';
        badge.querySelector('.status-text').textContent = 'Connected';

        statusText.className = 'connection-status connected';
        statusText.textContent = 'Connected to VPN';

        icon.className = 'connection-icon connected';
        info.textContent = `Portal: ${data.portal || 'Connected'}`;

        loadingState.classList.add('hidden');
        promptBox.classList.add('hidden');

        mainBtn.textContent = 'Disconnect';
        mainBtn.className = 'btn btn-danger connect-btn-large';
        mainBtn.onclick = handleDisconnect;
        mainBtn.classList.remove('hidden');

    } else if (data.status === 'connecting') {
        badge.className = 'status-badge connecting';
        badge.querySelector('.status-text').textContent = 'Connecting';

        statusText.className = 'connection-status connecting';
        statusText.textContent = 'Establishing tunnel...';

        icon.className = 'connection-icon connecting';
        info.textContent = `Portal: ${data.portal || ''}`;

        if (!data.prompt) {
            loadingState.classList.remove('hidden');
        }

        mainBtn.textContent = 'Disconnect';
        mainBtn.className = 'btn btn-danger connect-btn-large';
        mainBtn.onclick = handleDisconnect;
        mainBtn.classList.remove('hidden');

    } else {
        badge.className = 'status-badge';
        badge.querySelector('.status-text').textContent = 'Disconnected';

        statusText.className = 'connection-status';
        statusText.textContent = 'Disconnected';

        icon.className = 'connection-icon';
        info.textContent = 'Ready to connect';

        mainBtn.textContent = 'Connect VPN';
        mainBtn.className = 'btn btn-primary connect-btn-large';
        mainBtn.onclick = showPortalInput;

        // Do not fight with the portal form / loading / prompt state
        const portalFormOpen = !document.getElementById('portalForm').classList.contains('hidden');
        const loadingOpen = !loadingState.classList.contains('hidden');
        const promptOpen = !promptBox.classList.contains('hidden');
        if (!portalFormOpen && !loadingOpen && !promptOpen) {
            mainBtn.classList.remove('hidden');
        }
    }

    // Logs
    if (data.log && data.log.length > 0) {
        const container = document.getElementById('logContainer');
        const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 50;

        container.innerHTML = data.log.map(l => `
            <div class="log-entry ${l.level}">
                <span class="log-ts">[${l.timestamp}]</span>
                <span class="log-msg">${escapeHtml(l.message)}</span>
            </div>
        `).join('');

        if (isAtBottom) container.scrollTop = container.scrollHeight;
    }
}

// ---------- Credential prompt ----------
let promptKind = 'text';

function showPrompt(prompt) {
    const box = document.getElementById('promptBox');
    const label = document.getElementById('promptLabel');
    const input = document.getElementById('promptInput');

    if (box.classList.contains('hidden') || promptKind !== prompt.type) {
        label.textContent = prompt.text;
        input.type = prompt.type === 'password' ? 'password' : 'text';
        input.value = '';
        input.placeholder = prompt.type === 'password' ? '••••••••' : 'Enter value';
        promptKind = prompt.type;
    }

    document.getElementById('loadingState').classList.add('hidden');
    box.classList.remove('hidden');
    input.focus();
}

async function submitPrompt() {
    const input = document.getElementById('promptInput');
    const value = input.value;

    if (!value) {
        showToast('Please enter a value', 'warning');
        return;
    }

    try {
        const resp = await fetch('/api/respond_prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value })
        });
        const data = await resp.json();

        if (data.success) {
            input.value = '';
            document.getElementById('promptBox').classList.add('hidden');
            document.getElementById('loadingState').classList.remove('hidden');
        } else {
            showToast(data.message || 'Failed to submit', 'error');
        }
    } catch (e) {
        showToast('Error: ' + e.message, 'error');
    }
}

// ---------- Helpers ----------
async function clearLogs() {
    await fetch('/api/clear_logs', { method: 'POST' });
    document.getElementById('logContainer').innerHTML = '<div class="empty-state">Logs cleared.</div>';
    showToast('Logs cleared', 'info');
}

function refreshStatus() {
    fetch('/api/status').then(r => r.json()).then(updateUI);
    showToast('Status refreshed', 'info');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 250);
    }, 4000);
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

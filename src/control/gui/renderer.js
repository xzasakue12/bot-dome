const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const restartBtn = document.getElementById('restartBtn');
const refreshStatusBtn = document.getElementById('refreshStatusBtn');
const refreshLogsBtn = document.getElementById('refreshLogsBtn');
const logLinesSelect = document.getElementById('logLines');

const statusOutput = document.getElementById('statusOutput');
const logsOutput = document.getElementById('logsOutput');
const messageBanner = document.getElementById('message');

const themeToggle = document.getElementById('themeToggle');
const themeIcon = themeToggle ? themeToggle.querySelector('.theme-icon') : null;

const botStatusCard = document.getElementById('botStatusCard');
const botStatusValue = document.getElementById('botStatusValue');
const botStatusMeta = document.getElementById('botStatusMeta');
const mongoStatusCard = document.getElementById('mongoStatusCard');
const mongoStatusValue = document.getElementById('mongoStatusValue');
const mongoStatusMeta = document.getElementById('mongoStatusMeta');
const lastUpdatedValue = document.getElementById('lastUpdatedValue');

let messageTimeout = null;
let autoRefreshTimer = null;

const THEME_KEY = 'botControlTheme';
const AUTO_REFRESH_MS = 30_000;

function setMessage(text, type = 'info') {
    if (!text) {
        messageBanner.hidden = true;
        messageBanner.textContent = '';
        messageBanner.classList.remove('error', 'success');
        return;
    }

    messageBanner.hidden = false;
    messageBanner.textContent = text;
    messageBanner.classList.remove('error', 'success');
    if (type === 'error') {
        messageBanner.classList.add('error');
    } else if (type === 'success') {
        messageBanner.classList.add('success');
    }

    clearTimeout(messageTimeout);
    messageTimeout = setTimeout(() => setMessage(''), 4000);
}

async function handleAction(button, handler, successMessage) {
    if (button) {
        button.disabled = true;
    }

    try {
        const output = await handler();
        if (successMessage) {
            setMessage(successMessage, 'success');
        } else {
            setMessage('Done', 'success');
        }
        if (typeof output === 'string' && output.trim().length > 0) {
            statusOutput.textContent = output.trim();
        }
    } catch (error) {
        const message = error && error.message ? error.message : String(error);
        setMessage(message, 'error');
        console.error(error);
        throw error;
    } finally {
        if (button) {
            button.disabled = false;
        }
    }
}

function applyTheme(theme) {
    const nextTheme = theme === 'dark' ? 'dark' : 'light';
    document.body.dataset.theme = nextTheme;
    if (themeIcon) {
        themeIcon.textContent = nextTheme === 'dark' ? '☀' : '🌙';
    }
    if (themeToggle) {
        const label = nextTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
        themeToggle.setAttribute('aria-label', label);
        themeToggle.setAttribute('title', label);
    }
}

function initTheme() {
    if (!themeToggle) return;
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const storedTheme = window.localStorage.getItem(THEME_KEY);
    const initialTheme = storedTheme || (prefersDark ? 'dark' : 'light');
    applyTheme(initialTheme);

    themeToggle.addEventListener('click', () => {
        const current = document.body.dataset.theme === 'dark' ? 'dark' : 'light';
        const next = current === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        window.localStorage.setItem(THEME_KEY, next);
    });
}

function scheduleAutoRefresh() {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = setInterval(() => {
        refreshStatus();
        refreshLogs();
    }, AUTO_REFRESH_MS);
}

function parseDockerStatus(raw) {
    if (!raw || typeof raw !== 'string') return {};
    const lines = raw.split('\n').map(line => line.trim()).filter(Boolean);
    const result = {};

    for (const line of lines) {
        if (!line || line.startsWith('NAME') || line.startsWith('-')) continue;
        const parts = line.split(/\s{2,}/).filter(Boolean);
        if (!parts.length) continue;

        const name = parts[0];
        const service = parts[3] || '';
        const status = parts[5] || parts[4] || '';
        const created = parts[4] || '';

        result[name] = {
            name,
            service,
            status,
            created
        };
    }

    return result;
}

function stateFromStatus(status) {
    if (!status) return 'idle';
    const normalized = status.toLowerCase();
    if (normalized.startsWith('up')) return 'success';
    if (normalized.includes('healthy')) return 'success';
    if (normalized.includes('starting') || normalized.includes('restarting')) return 'warning';
    if (normalized.startsWith('exit') || normalized.includes('down') || normalized.includes('error')) return 'danger';
    return 'idle';
}

function updateCard(card, valueEl, metaEl, entry, fallbackLabel) {
    if (!card || !valueEl || !metaEl) return;
    if (!entry) {
        card.dataset.state = 'danger';
        valueEl.textContent = 'Unavailable';
        metaEl.textContent = fallbackLabel || 'Not found in docker compose output.';
        return;
    }

    card.dataset.state = stateFromStatus(entry.status);
    valueEl.textContent = entry.status || 'Unknown';
    const serviceLabel = entry.service ? `Service: ${entry.service}` : fallbackLabel || 'Service not detected.';
    const createdLabel = entry.created ? `Created ${entry.created}` : '';
    metaEl.textContent = [serviceLabel, createdLabel].filter(Boolean).join(' • ');
}

function findEntry(parsed, primaryName, serviceName) {
    if (!parsed) return undefined;
    if (parsed[primaryName]) return parsed[primaryName];
    return Object.values(parsed).find(entry => entry.service === serviceName);
}

function updateStatusSummary(rawStatus) {
    const parsed = parseDockerStatus(rawStatus);
    const botEntry = findEntry(parsed, 'my-discord-music-bot', 'bot');
    const mongoEntry = findEntry(parsed, 'my-discord-music-bot-mongo', 'mongodb');
    updateCard(botStatusCard, botStatusValue, botStatusMeta, botEntry, 'Discord bot container');
    updateCard(mongoStatusCard, mongoStatusValue, mongoStatusMeta, mongoEntry, 'MongoDB container');
    if (lastUpdatedValue) {
        lastUpdatedValue.textContent = new Date().toLocaleTimeString();
    }
}

async function refreshStatus() {
    statusOutput.textContent = 'Loading...';
    try {
        const status = await window.control.getStatus();
        statusOutput.textContent = status && status.trim() ? status.trim() : 'No status available.';
        updateStatusSummary(status);
    } catch (error) {
        const message = error && error.message ? error.message : String(error);
        statusOutput.textContent = 'Failed to load status.';
        setMessage(message, 'error');
        console.error(error);
    }
}

async function refreshLogs() {
    const lines = parseInt(logLinesSelect.value, 10) || 50;
    logsOutput.textContent = 'Loading...';
    try {
        const logs = await window.control.getLogs(lines);
        logsOutput.textContent = logs && logs.trim() ? logs.trim() : 'No logs available.';
    } catch (error) {
        const message = error && error.message ? error.message : String(error);
        logsOutput.textContent = 'Failed to load logs.';
        setMessage(message, 'error');
        console.error(error);
    }
}

startBtn.addEventListener('click', async () => {
    try {
        await handleAction(startBtn, () => window.control.startBot(), 'Bot started.');
        await refreshStatus();
        await refreshLogs();
    } catch (_) {
        /* already handled */
    }
});

stopBtn.addEventListener('click', async () => {
    try {
        await handleAction(stopBtn, () => window.control.stopBot(), 'Bot stopped.');
        await refreshStatus();
        await refreshLogs();
    } catch (_) {
        /* already handled */
    }
});

restartBtn.addEventListener('click', async () => {
    try {
        await handleAction(restartBtn, () => window.control.restartBot(), 'Bot restarted.');
        await refreshStatus();
        await refreshLogs();
    } catch (_) {
        /* already handled */
    }
});

refreshStatusBtn.addEventListener('click', () => {
    setMessage('');
    refreshStatus();
});

refreshLogsBtn.addEventListener('click', () => {
    setMessage('');
    refreshLogs();
});

logLinesSelect.addEventListener('change', () => {
    refreshLogs();
});

window.addEventListener('DOMContentLoaded', () => {
    initTheme();
    refreshStatus();
    refreshLogs();
    scheduleAutoRefresh();
});

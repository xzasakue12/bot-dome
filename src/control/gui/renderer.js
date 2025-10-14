const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const restartBtn = document.getElementById('restartBtn');
const refreshStatusBtn = document.getElementById('refreshStatusBtn');
const refreshLogsBtn = document.getElementById('refreshLogsBtn');
const logLinesSelect = document.getElementById('logLines');

const statusOutput = document.getElementById('statusOutput');
const logsOutput = document.getElementById('logsOutput');
const messageBanner = document.getElementById('message');

let messageTimeout = null;

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

async function refreshStatus() {
    statusOutput.textContent = 'Loading...';
    try {
        const status = await window.control.getStatus();
        statusOutput.textContent = status && status.trim() ? status.trim() : 'No status available.';
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
    refreshStatus();
    refreshLogs();
});

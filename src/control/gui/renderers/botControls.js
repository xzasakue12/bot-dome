import { parseDockerStatus } from '../utils/docker.js';

const AUTO_REFRESH_MS = 30_000;

export function createBotControls(elements) {
    const {
        startBtn,
        stopBtn,
        restartBtn,
        refreshStatusBtn,
        refreshLogsBtn,
        logLinesSelect,
        statusOutput,
        logsOutput,
        botStatusCard,
        botStatusValue,
        botStatusMeta,
        mongoStatusCard,
        mongoStatusValue,
        mongoStatusMeta,
        lastUpdatedValue,
        notifier
    } = elements;

    let autoRefreshTimer = null;

    function scheduleAutoRefresh() {
        clearInterval(autoRefreshTimer);
        autoRefreshTimer = setInterval(() => {
            refreshStatus();
            refreshLogs();
        }, AUTO_REFRESH_MS);
    }

    async function handleAction(button, handler, message) {
        if (!button) return;
        button.disabled = true;
        try {
            const output = await handler();
            notifier.setMessage(message || 'Done', 'success');
            if (typeof output === 'string' && output.trim().length > 0) {
                statusOutput.textContent = output.trim();
            }
        } catch (error) {
            const messageText = error && error.message ? error.message : String(error);
            notifier.setMessage(messageText, 'error');
            throw error;
        } finally {
            button.disabled = false;
        }
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
            metaEl.textContent = fallbackLabel || 'Service not found.';
            return;
        }

        card.dataset.state = stateFromStatus(entry.status);
        valueEl.textContent = entry.status || 'Unknown';
        const serviceLabel = entry.service ? `Service: ${entry.service}` : fallbackLabel || 'Service not detected.';
        const createdLabel = entry.created ? `Created ${entry.created}` : '';
        metaEl.textContent = [serviceLabel, createdLabel].filter(Boolean).join(' • ');
    }

    function updateStatusSummary(rawStatus) {
        const parsed = parseDockerStatus(rawStatus);
        const botEntry = parsed['my-discord-music-bot'] || Object.values(parsed).find(entry => entry.service === 'bot');
        const mongoEntry = parsed['my-discord-music-bot-mongo'] || Object.values(parsed).find(entry => entry.service === 'mongodb');
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
            notifier.setMessage(message, 'error');
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
            notifier.setMessage(message, 'error');
        }
    }

    if (startBtn) {
        startBtn.addEventListener('click', () =>
            handleAction(startBtn, () => window.control.startBot(), 'Bot started.').then(() => {
                refreshStatus();
                refreshLogs();
            })
        );
    }

    if (stopBtn) {
        stopBtn.addEventListener('click', () =>
            handleAction(stopBtn, () => window.control.stopBot(), 'Bot stopped.').then(() => {
                refreshStatus();
                refreshLogs();
            })
        );
    }

    if (restartBtn) {
        restartBtn.addEventListener('click', () =>
            handleAction(restartBtn, () => window.control.restartBot(), 'Bot restarted.').then(() => {
                refreshStatus();
                refreshLogs();
            })
        );
    }

    if (refreshStatusBtn) {
        refreshStatusBtn.addEventListener('click', () => {
            notifier.setMessage('');
            refreshStatus();
        });
    }

    if (refreshLogsBtn) {
        refreshLogsBtn.addEventListener('click', () => {
            notifier.setMessage('');
            refreshLogs();
        });
    }

    if (logLinesSelect) {
        logLinesSelect.addEventListener('change', () => refreshLogs());
    }

    function enableAdminControls(enabled) {
        [startBtn, stopBtn, restartBtn].forEach((button) => {
            if (!button) return;
            button.disabled = !enabled;
            button.title = enabled ? '' : 'Admin role required';
        });
    }

    function hideAdminPanels() {
        [startBtn, stopBtn, restartBtn, refreshStatusBtn, refreshLogsBtn, logLinesSelect].forEach((el) => {
            if (el) {
                el.closest('.admin-only')?.classList.add('hidden');
            }
        });
        if (botStatusCard) botStatusCard.classList.add('hidden');
        if (mongoStatusCard) mongoStatusCard.classList.add('hidden');
        if (statusOutput) statusOutput.textContent = 'Admin access required to view status.';
        if (logsOutput) logsOutput.textContent = 'Admin access required to view logs.';
    }

    function showAdminPanels() {
        document.querySelectorAll('.admin-only.hidden').forEach((el) => el.classList.remove('hidden'));
        enableAdminControls(true);
    }

    function stopAutoRefresh() {
        clearInterval(autoRefreshTimer);
        autoRefreshTimer = null;
    }

    return {
        refreshStatus,
        refreshLogs,
        scheduleAutoRefresh,
        stopAutoRefresh,
        enableAdminControls,
        hideAdminPanels,
        showAdminPanels,
        notifier
    };
}

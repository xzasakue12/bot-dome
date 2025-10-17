import { initTheme } from '../../renderers/theme.js';
import { createNotifier } from '../../renderers/notifier.js';
import { createBotControls } from '../../renderers/botControls.js';
import { createSubscriptionManager } from '../../renderers/subscriptions.js';
import { attachAuthHandlers } from '../../renderers/auth.js';

const notifier = createNotifier(document.getElementById('message'));
const botControls = createBotControls({
    startBtn: document.getElementById('startBtn'),
    stopBtn: document.getElementById('stopBtn'),
    restartBtn: document.getElementById('restartBtn'),
    refreshStatusBtn: document.getElementById('refreshStatusBtn'),
    refreshLogsBtn: document.getElementById('refreshLogsBtn'),
    logLinesSelect: document.getElementById('logLines'),
    statusOutput: document.getElementById('statusOutput'),
    logsOutput: document.getElementById('logsOutput'),
    botStatusCard: document.getElementById('botStatusCard'),
    botStatusValue: document.getElementById('botStatusValue'),
    botStatusMeta: document.getElementById('botStatusMeta'),
    mongoStatusCard: document.getElementById('mongoStatusCard'),
    mongoStatusValue: document.getElementById('mongoStatusValue'),
    mongoStatusMeta: document.getElementById('mongoStatusMeta'),
    lastUpdatedValue: document.getElementById('lastUpdatedValue'),
    notifier
});

const subscriptions = createSubscriptionManager({
    container: document.getElementById('subscriptionPanel'),
    toggles: {
        manager: document.getElementById('toggleSubManager')
    },
    forms: {
        lookup: document.getElementById('lookupForm'),
        create: document.getElementById('subscriptionForm')
    },
    inputs: {
        lookupCode: document.getElementById('subscriptionCode'),
        subName: document.getElementById('subName'),
        subInvite: document.getElementById('subInvite'),
        subNotes: document.getElementById('subNotes')
    },
    views: {
        result: document.getElementById('subscriptionResult'),
        inviteCard: document.getElementById('inviteCard'),
        inviteDescription: document.getElementById('inviteDescription'),
        inviteLink: document.getElementById('inviteLink'),
        admin: document.getElementById('subscriptionAdmin'),
        table: document.getElementById('subscriptionTable')
    },
    notifier
});

initTheme({ toggle: document.getElementById('themeToggle') });

attachAuthHandlers({
    roleBadge: document.getElementById('roleBadge'),
    logoutBtn: document.getElementById('logoutBtn'),
    botControls,
    subscriptions,
    notifier
});

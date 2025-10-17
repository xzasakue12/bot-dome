export function attachAuthHandlers({ roleBadge, logoutBtn, botControls, subscriptions, notifier }) {
    function applyRole(role) {
        const isAdmin = role === 'admin';
        const isUser = role === 'user';

        if (roleBadge) {
            roleBadge.textContent = role ? `Role: ${role}` : 'Role: —';
        }

        botControls.enableAdminControls(isAdmin);
        if (isAdmin) {
            botControls.showAdminPanels();
        } else if (role) {
            botControls.hideAdminPanels();
        }
        subscriptions.applyRole(role);

        if (role) {
            if (isAdmin) {
                botControls.scheduleAutoRefresh();
                botControls.refreshStatus();
                botControls.refreshLogs();
                subscriptions.loadSubscriptions();
            } else if (isUser) {
                botControls.stopAutoRefresh();
                subscriptions.loadUserInvites();
            }
        } else {
            botControls.stopAutoRefresh();
            subscriptions.clearInvite();
        }
    }

    window.auth.onRoleChange((role) => {
        applyRole(role);
        if (!role) {
            notifier.setMessage('Logged out', 'info');
        }
    });

    window.addEventListener('DOMContentLoaded', () => {
        window.auth.getRole().then((role) => {
            applyRole(role);
            if (!role) {
                notifier.setMessage('Please log in.', 'info');
            }
        });
    });

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            window.auth.logout().catch((error) => {
                const message = error && error.message ? error.message : String(error);
                notifier.setMessage(message, 'error');
            });
        });
    }
}

import { escapeHtml, escapeAttr, formatDate } from '../utils/dom.js';

export function createSubscriptionManager({
    container,
    toggles,
    forms,
    inputs,
    views,
    notifier
}) {
    let currentRole = null;

    function applyRole(role) {
        currentRole = role;
        const isAdmin = role === 'admin';
        const isUser = role === 'user';

        if (container) {
            container.hidden = !role;
        }

        if (views.admin) {
            views.admin.hidden = !isAdmin;
        }

        if (views.userInfo) {
            views.userInfo.hidden = !isUser;
        }

        if (!role) {
            clearInvite();
            setLookupMessage('');
        }
    }

    function setLookupMessage(text, type = 'info') {
        const { result } = views;
        if (!result) return;
        result.hidden = !text;
        if (!text) {
            result.textContent = '';
            result.className = 'subscription-result';
            return;
        }
        result.textContent = text;
        result.className = `subscription-result ${type}`;
    }

    function clearInvite() {
        const { inviteCard, inviteDescription, inviteLink } = views;
        if (inviteCard) inviteCard.hidden = true;
        if (inviteDescription) inviteDescription.textContent = '';
        if (inviteLink) {
            inviteLink.href = '#';
            inviteLink.textContent = '';
        }
        if (inputs.lookupCode) {
            inputs.lookupCode.value = '';
        }
    }

    function displayInvite(invite) {
        const { inviteCard, inviteDescription, inviteLink } = views;
        if (inviteCard) inviteCard.hidden = false;
        if (inviteDescription) {
            inviteDescription.textContent = invite.notes ? invite.notes : 'Use the link below to invite the bot to your Discord server.';
        }
        if (inviteLink) {
            inviteLink.href = invite.inviteUrl;
            inviteLink.textContent = invite.inviteUrl;
        }
    }

    async function lookupSubscription(code) {
        try {
            const invite = await window.subscriptions.lookup(code);
            if (!invite) {
                setLookupMessage('No subscription found for that code.', 'error');
                clearInvite();
                return;
            }
            displayInvite(invite);
            setLookupMessage(`Welcome, ${invite.name}!`, 'success');
        } catch (error) {
            const message = error && error.message ? error.message : String(error);
            setLookupMessage(message, 'error');
            clearInvite();
        }
    }

    function bindCreateForm() {
        const { create } = forms;
        if (!create) return;
        create.addEventListener('submit', async (event) => {
            event.preventDefault();
            try {
                const payload = {
                    name: inputs.subName ? inputs.subName.value.trim() : '',
                    inviteUrl: inputs.subInvite ? inputs.subInvite.value.trim() : '',
                    notes: inputs.subNotes ? inputs.subNotes.value.trim() : ''
                };
                await window.subscriptions.create(payload);
                notifier.setMessage('Subscription created.', 'success');
                create.reset();
                loadSubscriptions();
            } catch (error) {
                const message = error && error.message ? error.message : String(error);
                notifier.setMessage(message, 'error');
            }
        });
    }

    function bindTableActions() {
        const table = views.table;
        if (!table) return;
        table.addEventListener('click', async (event) => {
            const button = event.target.closest('button[data-id]');
            if (!button) return;
            const id = button.getAttribute('data-id');
            if (!id) return;
            try {
                await window.subscriptions.remove(id);
                notifier.setMessage('Subscription removed.', 'success');
                loadSubscriptions();
            } catch (error) {
                const message = error && error.message ? error.message : String(error);
                notifier.setMessage(message, 'error');
            }
        });
    }

    function bindToggle() {
        const button = toggles.manager;
        if (!button || !views.admin) return;
        button.addEventListener('click', () => {
            const hidden = views.admin.hidden;
            views.admin.hidden = !hidden;
            button.textContent = hidden ? 'Hide' : 'Manage';
            if (hidden) {
                loadSubscriptions();
            }
        });
    }

    function renderSubscriptions(entries) {
        const table = views.table;
        if (!table) return;
        const tbody = table.querySelector('tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        entries.forEach((entry) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${escapeHtml(entry.name)}</td>
                <td><code>${entry.code}</code></td>
                <td><a href="${escapeAttr(entry.inviteUrl)}" target="_blank" rel="noreferrer noopener">Invite</a></td>
                <td>${formatDate(entry.createdAt)}</td>
                <td class="sub-actions"><button data-id="${entry.id}">Remove</button></td>
            `;
            tbody.appendChild(tr);
        });
    }

    function loadSubscriptions() {
        if (currentRole !== 'admin') return;
        window.subscriptions.list()
            .then(renderSubscriptions)
            .catch((error) => {
                const message = error && error.message ? error.message : String(error);
                notifier.setMessage(message, 'error');
            });
    }

    bindCreateForm();
    bindTableActions();
    bindToggle();

    return {
        applyRole,
        loadSubscriptions,
        clearInvite,
        setLookupMessage,
        loadUserInvites: () => {
            if (views.inviteCard) views.inviteCard.hidden = false;
            if (views.userInfo) views.userInfo.hidden = false;
        }
    };
}

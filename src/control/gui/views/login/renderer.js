const form = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const submitBtn = document.getElementById('loginBtn');
const errorMessage = document.getElementById('error');

let API_BASE = 'http://localhost:4000';

window.env.get('AUTH_API_BASE').then((value) => {
    if (value) {
        API_BASE = value;
    }
});

function setError(message) {
    if (!message) {
        errorMessage.hidden = true;
        errorMessage.textContent = '';
        return;
    }
    errorMessage.hidden = false;
    errorMessage.textContent = message;
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!email) {
        setError('Email is required.');
        return;
    }

    setError('');
    submitBtn.disabled = true;

    try {
        let response;
        if (password) {
            response = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
        } else {
            response = await fetch(`${API_BASE}/auth/request-code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
        }

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || 'Login failed');
        }

        const data = await response.json().catch(() => ({}));

        if (password) {
            if (!data || !data.token) {
                throw new Error('Login failed.');
            }
            await window.auth.login(data.token);
        } else {
            if (data.code) {
                console.log(`Dev mode verification code for ${email}: ${data.code}`);
                setError(`Dev mode code: ${data.code}`);
                const verifyResponse = await fetch(`${API_BASE}/auth/verify-code`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, code: data.code })
                });

                if (!verifyResponse.ok) {
                    const verifyData = await verifyResponse.json().catch(() => ({}));
                    throw new Error(verifyData.error || 'Verification failed');
                }

                const verifyData = await verifyResponse.json().catch(() => ({}));
                if (!verifyData || !verifyData.token) {
                    throw new Error('Verification failed.');
                }
                await window.auth.login(verifyData.token);
            } else {
                setError('Code sent to your email.');
            }
        }
    } catch (err) {
        setError(err.message);
    } finally {
        submitBtn.disabled = false;
    }
});

emailInput.focus();

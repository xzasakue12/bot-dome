const THEME_KEY = 'botControlTheme';

export function initTheme({ toggle } = {}) {
    if (!toggle) return;
    const icon = toggle.querySelector('.theme-icon');

    function applyTheme(theme) {
        const nextTheme = theme === 'dark' ? 'dark' : 'light';
        document.body.dataset.theme = nextTheme;
        if (icon) {
            icon.textContent = nextTheme === 'dark' ? '☀' : '🌙';
        }
        const label = nextTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
        toggle.setAttribute('aria-label', label);
        toggle.setAttribute('title', label);
    }

    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const storedTheme = window.localStorage.getItem(THEME_KEY);
    applyTheme(storedTheme || (prefersDark ? 'dark' : 'light'));

    toggle.addEventListener('click', () => {
        const current = document.body.dataset.theme === 'dark' ? 'dark' : 'light';
        const next = current === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        window.localStorage.setItem(THEME_KEY, next);
    });
}

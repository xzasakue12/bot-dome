export function createNotifier(element) {
    let timeoutId = null;

    function clearTimer() {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
    }

    function setMessage(text, type = 'info') {
        if (!element) return;
        clearTimer();

        if (!text) {
            element.hidden = true;
            element.textContent = '';
            element.classList.remove('error', 'success');
            return;
        }

        element.hidden = false;
        element.textContent = text;
        element.classList.remove('error', 'success');
        if (type === 'error') {
            element.classList.add('error');
        } else if (type === 'success') {
            element.classList.add('success');
        }

        timeoutId = setTimeout(() => {
            setMessage('');
        }, 4000);
    }

    return {
        setMessage
    };
}

(() => {
    const articleId = window.articleId;
    const activityTimeoutMs = 10 * 1000;
    const intervalMs = 5 * 1000;

    if (!articleId) return;

    // Global timestamps used to decide whether the reader is still active.
    let lastActivityAt = Date.now();
    let lastSentAt = Date.now();

    function markActivity() {
        lastActivityAt = Date.now();
    }

    ['mousemove', 'scroll', 'keydown', 'click', 'touchstart'].forEach(eventName => {
        document.addEventListener(eventName, markActivity, { passive: true });
    });

    async function sendReadingTime() {
        const now = Date.now();
        const inactiveFor = now - lastActivityAt;
        const tabIsVisible = document.visibilityState === 'visible';
        const windowIsFocused = document.hasFocus();

        if (!tabIsVisible || !windowIsFocused || inactiveFor > activityTimeoutMs) return;
        if (now - lastSentAt < intervalMs) return;

        lastSentAt = now;

        try {
            await fetch(`/api/articles/${articleId}/reading-time`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ seconds: 5 }),
            });
        } catch (error) {
            // A temporary network error should not interrupt reading.
            console.warn('Could not update reading time', error);
        }
    }

    window.setInterval(sendReadingTime, intervalMs);
})();

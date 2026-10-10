(() => {
    const fallback = '/img/default-article.jpg';

    function useFallback(image) {
        if (image instanceof HTMLImageElement && image.hasAttribute('data-article-image') &&
            image.getAttribute('src') !== fallback) {
            image.src = fallback;
        }
    }

    // Capturing also catches errors on article cards inserted by infinite scroll.
    // External listeners work with the site's Content-Security-Policy.
    document.addEventListener('error', event => useFallback(event.target), true);
    document.querySelectorAll('img[data-article-image]').forEach(image => {
        if (image.complete && image.naturalWidth === 0) useFallback(image);
    });
})();

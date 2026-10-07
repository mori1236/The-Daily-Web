// Client script for single article page
document.addEventListener('DOMContentLoaded', () => {
    try {
        const articleElement = document.querySelector('[data-article-id]');
        const currentPath = window.location.pathname;
        const match = currentPath.match(/\/articles\/([0-9a-fA-F]{24})/);
        const articleId = match ? match[1] : (articleElement ? articleElement.dataset.articleId : null);

        if (articleId) {
            const readKey = 'dailyweb_read_articles';
            const readList = JSON.parse(localStorage.getItem(readKey) || '[]');
            if (!readList.includes(articleId)) {
                readList.push(articleId);
                localStorage.setItem(readKey, JSON.stringify(readList));
            }
        }
    } catch (e) {
        console.warn('Could not store read article', e);
    }
});

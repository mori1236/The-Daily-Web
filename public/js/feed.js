// Client-side script for home feed: infinite scroll, category filtering, search, and read status

document.addEventListener('DOMContentLoaded', () => {
    // Helper: Determine active category from URL, dataset, or chips
    function getActiveCategory() {
        const urlParams = new URLSearchParams(window.location.search);
        const fromUrl = urlParams.get('category');
        if (fromUrl) return fromUrl;

        const feedMain = document.getElementById('feedMain');
        if (feedMain && feedMain.dataset.currentCategory) {
            return feedMain.dataset.currentCategory;
        }

        const activeChip = document.querySelector('.category-chip.active');
        if (activeChip && activeChip.dataset.category) {
            return activeChip.dataset.category;
        }

        return 'all';
    }

    // State
    const urlParams = new URLSearchParams(window.location.search);
    let currentCategory = getActiveCategory();
    let currentSort = urlParams.get('sort') || 'newest';
    let currentSearch = urlParams.get('q') || '';
    let currentReadFilter = urlParams.get('readStatus') || 'all';
    let currentPage = 1;
    const limit = 20;
    let isLoading = false;
    let hasMore = true;

    // DOM Elements
    const grid = document.getElementById('articlesGrid');
    const emptyState = document.getElementById('emptyState');
    const loader = document.getElementById('feedLoader');
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    const allLoadedNotice = document.getElementById('allLoadedNotice');
    const sentinel = document.getElementById('scrollSentinel');
    const categoryChips = document.querySelectorAll('.category-chip');
    const searchInput = document.getElementById('searchInput');
    const sortSelect = document.getElementById('sortSelect');
    const readStatusSelect = document.getElementById('readStatusSelect');

    if (readStatusSelect) {
        readStatusSelect.value = currentReadFilter;
    }

    const READ_STORAGE_KEY = 'dailyweb_read_articles';

    // Helper: Get read article IDs from localStorage
    function getReadArticles() {
        try {
            return JSON.parse(localStorage.getItem(READ_STORAGE_KEY) || '[]');
        } catch (e) {
            return [];
        }
    }

    // Helper: Mark an article ID as read
    function markArticleAsRead(id) {
        if (!id) return;
        try {
            const list = getReadArticles();
            if (!list.includes(id)) {
                list.push(id);
                localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(list));
            }
            updateReadBadges();
            applyReadFilter();
        } catch (e) {
            console.warn('Storage error', e);
        }
    }

    // Update all cards in DOM with their current read/unread status
    function updateReadBadges() {
        const readList = getReadArticles();
        document.querySelectorAll('.read-indicator').forEach(container => {
            const id = container.dataset.readId;
            if (id && readList.includes(id)) {
                container.innerHTML = `
                    <span class="read-badge read">
                        <span class="read-check">✓</span>
                        <span class="read-text">נצפה</span>
                    </span>
                `;
            } else if (id) {
                container.innerHTML = `
                    <span class="read-badge unread">
                        <span class="read-dot"></span>
                        <span class="read-text">טרם נצפה</span>
                    </span>
                `;
            }
        });
    }

    // Filter cards currently in DOM according to read/unread status
    function applyReadFilter() {
        const readList = getReadArticles();
        const cards = grid.querySelectorAll('.feed-card');
        let visibleCount = 0;

        cards.forEach(card => {
            const id = card.dataset.articleId;
            let visible = true;
            if (currentReadFilter === 'read') {
                visible = readList.includes(id);
            } else if (currentReadFilter === 'unread') {
                visible = !readList.includes(id);
            }
            card.style.display = visible ? '' : 'none';
            if (visible) visibleCount++;
        });

        if (emptyState) {
            emptyState.style.display = (visibleCount === 0) ? 'block' : 'none';
            const emptyMsg = emptyState.querySelector('p');
            if (emptyMsg && visibleCount === 0) {
                if (currentReadFilter === 'read') {
                    emptyMsg.textContent = 'טרם צפית בכתבות מתוך הקטגוריה שנבחרה.';
                } else if (currentReadFilter === 'unread') {
                    emptyMsg.textContent = 'כל הכתבות שנטענו כבר נצפו.';
                } else {
                    emptyMsg.textContent = 'לא נמצאו כתבות התואמות לחיפוש או לקטגוריה שנבחרה.';
                }
            }
        }

        // If visible cards are few, auto-load next page to populate
        if (visibleCount < 8 && hasMore && !isLoading && currentReadFilter !== 'all') {
            fetchArticles(currentPage + 1, false);
        }
    }

    // Sanitize string for HTML insertion
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Render a single article card HTML
    function createArticleCardHtml(article) {
        const readList = getReadArticles();
        const isRead = readList.includes(article.id);

        const readBadgeHtml = isRead
            ? `<span class="read-badge read"><span class="read-check">✓</span><span class="read-text">נצפה</span></span>`
            : `<span class="read-badge unread"><span class="read-dot"></span><span class="read-text">טרם נצפה</span></span>`;

        return `
            <article class="feed-card" data-article-id="${escapeHtml(article.id)}">
                <a href="${escapeHtml(article.url)}" class="feed-card-link" aria-label="${escapeHtml(article.title)}">
                    <div class="feed-card-media">
                        <img 
                            src="${escapeHtml(article.imageUrl)}" 
                            alt="${escapeHtml(article.title)}"
                            loading="lazy"
                            onerror="this.onerror=null; this.src='/img/login-newsroom.jpg';"
                        />
                    </div>
                    <div class="feed-card-content">
                        <div class="feed-card-meta">
                            <div class="meta-right">
                                <span class="feed-card-category category-${escapeHtml(article.category)}">
                                    ${escapeHtml(article.categoryLabel)}
                                </span>
                                <span class="meta-dot">·</span>
                                <span class="feed-card-time">${escapeHtml(article.publishedAtFormatted)}</span>
                            </div>
                            <div class="meta-left">
                                <span class="read-indicator" data-read-id="${escapeHtml(article.id)}">
                                    ${readBadgeHtml}
                                </span>
                            </div>
                        </div>

                        <h3 class="feed-card-title">${escapeHtml(article.title)}</h3>
                        
                        ${article.summary ? `<p class="feed-card-summary">${escapeHtml(article.summary)}</p>` : ''}

                        <div class="feed-card-footer">
                            <span class="feed-card-author">מאת ${escapeHtml(article.writer)}</span>
                        </div>
                    </div>
                </a>
            </article>
        `;
    }

    // Helper: Update hero card in DOM
    function updateHeroArticle(hero) {
        const heroCard = document.getElementById('heroArticleCard');
        if (!heroCard || !hero) return;

        heroCard.dataset.articleId = hero.id;

        const title = document.getElementById('heroTitle');
        if (title) title.textContent = hero.title;

        const summary = document.getElementById('heroSummary');
        if (summary) summary.textContent = hero.summary;

        const author = document.getElementById('heroAuthor');
        if (author) author.textContent = `מאת ${hero.writer}`;

        const time = document.getElementById('heroTime');
        if (time) time.textContent = hero.publishedAtFormatted;

        const readTime = document.getElementById('heroReadingTime');
        if (readTime) readTime.textContent = hero.readingTime;

        const link = document.getElementById('heroReadBtn');
        if (link) link.href = hero.url;

        const img = document.getElementById('heroImg');
        if (img) {
            img.src = hero.imageUrl || '/img/login-newsroom.jpg';
            img.alt = hero.title;
        }
    }

    // Fetch articles from /api/articles with pagination, search, category, and sort
    async function fetchArticles(pageToFetch, replace = false) {
        if (isLoading) return;
        isLoading = true;

        if (loader) loader.style.display = 'flex';
        if (loadMoreBtn) loadMoreBtn.style.display = 'none';

        try {
            currentCategory = getActiveCategory();
            const params = new URLSearchParams({
                page: String(pageToFetch),
                limit: String(limit),
                sort: currentSort,
            });

            if (currentCategory && currentCategory !== 'all') {
                params.set('category', currentCategory);
            }

            if (currentSearch) {
                params.set('q', currentSearch);
            }

            const response = await fetch(`/api/articles?${params.toString()}`);
            if (!response.ok) throw new Error('Network error');

            const data = await response.json();
            const articles = data.articles || [];

            if (replace) {
                grid.innerHTML = '';
            }

            // Update hero article when on first page of a category
            if (pageToFetch === 1 && data.heroArticle) {
                updateHeroArticle(data.heroArticle);
            }

            if (articles.length > 0) {
                const fragment = document.createDocumentFragment();
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = articles.map(createArticleCardHtml).join('');

                while (tempDiv.firstChild) {
                    fragment.appendChild(tempDiv.firstChild);
                }
                grid.appendChild(fragment);
            }

            currentPage = pageToFetch;
            hasMore = Boolean(data.hasMore);

            // Handle UI states
            if (emptyState) {
                emptyState.style.display = (grid.children.length === 0) ? 'block' : 'none';
            }

            if (allLoadedNotice) {
                allLoadedNotice.style.display = (!hasMore && grid.children.length > 0) ? 'block' : 'none';
            }

            if (loadMoreBtn) {
                loadMoreBtn.style.display = (hasMore && !isLoading) ? 'block' : 'none';
            }

            // Update read badges for newly loaded cards
            updateReadBadges();

        } catch (err) {
            console.error('Failed to load articles:', err);
            if (loadMoreBtn && hasMore) {
                loadMoreBtn.style.display = 'block';
                loadMoreBtn.textContent = 'שגיאה בטעינה — נסה שוב';
            }
        } finally {
            isLoading = false;
            if (loader) loader.style.display = 'none';
            if (loadMoreBtn && hasMore) {
                loadMoreBtn.style.display = 'block';
                loadMoreBtn.textContent = 'הצגת כתבות נוספות';
            }
        }
    }

    // Infinite scroll observer: triggers automatic fetch of next 20 articles near page bottom
    if (sentinel && 'IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries) => {
            const entry = entries[0];
            if (entry.isIntersecting && hasMore && !isLoading) {
                fetchArticles(currentPage + 1, false);
            }
        }, {
            root: null,
            rootMargin: '300px', // Pre-fetch 300px before user reaches the bottom
            threshold: 0.1,
        });

        observer.observe(sentinel);
    }

    // Fallback: Click on "הצגת כתבות נוספות" button
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            if (hasMore && !isLoading) {
                fetchArticles(currentPage + 1, false);
            }
        });
    }

    // Category filter clicks
    categoryChips.forEach(chip => {
        chip.addEventListener('click', () => {
            const cat = chip.dataset.category || 'all';
            if (cat === currentCategory) return;

            categoryChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');

            currentCategory = cat;
            currentPage = 1;
            hasMore = true;

            // Reflect in URL without full page reload
            const nextUrl = (cat === 'all') ? '/' : `/?category=${encodeURIComponent(cat)}`;
            window.history.pushState({ category: cat }, '', nextUrl);

            fetchArticles(1, true);
        });
    });

    // Handle browser back/forward buttons
    window.addEventListener('popstate', () => {
        currentCategory = getActiveCategory();
        const urlParams = new URLSearchParams(window.location.search);
        currentSort = urlParams.get('sort') || 'newest';
        if (sortSelect) sortSelect.value = currentSort;
        currentSearch = urlParams.get('q') || '';
        if (searchInput) searchInput.value = currentSearch;

        categoryChips.forEach(c => {
            if ((c.dataset.category || 'all') === currentCategory) c.classList.add('active');
            else c.classList.remove('active');
        });

        // Update active class on top navigation links
        document.querySelectorAll('.site-header nav a').forEach(a => {
            const href = a.getAttribute('href') || '';
            const match = href.match(/category=([^&]+)/);
            const cat = match ? decodeURIComponent(match[1]) : 'all';
            if (cat === currentCategory) a.classList.add('active');
            else a.classList.remove('active');
        });

        currentPage = 1;
        hasMore = true;
        fetchArticles(1, true);
    });

    // Search input with debounce (300ms)
    let searchTimeout = null;
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                const val = e.target.value.trim();
                if (val !== currentSearch) {
                    currentSearch = val;
                    currentCategory = getActiveCategory();
                    currentPage = 1;
                    hasMore = true;

                    const url = new URL(window.location.href);
                    if (currentCategory && currentCategory !== 'all') {
                        url.searchParams.set('category', currentCategory);
                    } else {
                        url.searchParams.delete('category');
                    }
                    if (currentSort && currentSort !== 'newest') {
                        url.searchParams.set('sort', currentSort);
                    } else {
                        url.searchParams.delete('sort');
                    }
                    if (currentSearch) {
                        url.searchParams.set('q', currentSearch);
                    } else {
                        url.searchParams.delete('q');
                    }
                    window.history.pushState(null, '', url.pathname + url.search);

                    fetchArticles(1, true);
                }
            }, 300);
        });
    }

    // Sort select change
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            currentSort = e.target.value;
            currentCategory = getActiveCategory();
            currentPage = 1;
            hasMore = true;

            const url = new URL(window.location.href);
            if (currentCategory && currentCategory !== 'all') {
                url.searchParams.set('category', currentCategory);
            } else {
                url.searchParams.delete('category');
            }
            if (currentSort && currentSort !== 'newest') {
                url.searchParams.set('sort', currentSort);
            } else {
                url.searchParams.delete('sort');
            }
            if (currentSearch) {
                url.searchParams.set('q', currentSearch);
            } else {
                url.searchParams.delete('q');
            }
            window.history.pushState(null, '', url.pathname + url.search);

            fetchArticles(1, true);
        });
    }

    // Track card clicks to update read status immediately
    document.addEventListener('click', (e) => {
        const cardLink = e.target.closest('.feed-card-link, .hero-read-btn');
        if (cardLink) {
            const card = cardLink.closest('[data-article-id]');
            if (card && card.dataset.articleId) {
                markArticleAsRead(card.dataset.articleId);
            }
        }
    });

    // Initial check for read badges on server-rendered cards
    updateReadBadges();
});
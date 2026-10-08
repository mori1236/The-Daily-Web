// Client script for the editor's queue page (views/editor.ejs).
// The server renders the first page. From there the status filters, the search box, the paging
// buttons and the review panel load their data from /api/editor with fetch, so the page never reloads.
// The decisions (approve, return, delete) are sent from here too.

const queueBox = document.querySelector('.queue');
const queueList = document.getElementById('queue-list');
const itemTemplate = document.getElementById('queue-item-template');
const searchForm = document.getElementById('queue-search');
const searchInput = document.getElementById('queue-search-input');
const statusInput = searchForm.elements.status;
const articleInput = searchForm.elements.article;
const filterLinks = document.querySelectorAll('[data-filter-link]');
const pagination = document.getElementById('queue-pagination');
const pageLinks = pagination.querySelectorAll('[data-page-link]'); // [previous, next]
const pendingBadge = document.getElementById('queue-pending-badge');
const totalText = queueBox.querySelector('[data-total]');

const review = document.getElementById('review');
const reviewEmpty = document.getElementById('review-empty');
const reviewError = document.getElementById('review-error');
const returnBox = document.getElementById('review-return');
const noteInput = document.getElementById('review-note');
const returnedNote = document.getElementById('review-returned-note');
const publishButton = review.querySelector('[data-action="publish"]');
const returnButton = review.querySelector('[data-action="return"]');
const deleteButton = review.querySelector('[data-action="delete"]');
const editLink = review.querySelector('[data-edit-link]');

const deleteDialog = document.getElementById('delete-dialog');
const deleteCancel = document.getElementById('delete-dialog-cancel');
const deleteConfirm = document.getElementById('delete-dialog-confirm');

const SEARCH_DELAY_MS = 300;

// What the server says when an action is refused (the server's own text is in English).
const reasonMessages = {
    forbidden: 'אין לך הרשאה לפעולה הזו.',
    'invalid-state': 'מצב הכתבה השתנה בינתיים. רעננו את הרשימה ונסו שוב.',
    'invalid-input': 'חסרים פרטים. בדקו את הכתבה ונסו שוב.',
};

// The list and the article the user is looking at. They start from the URL the server rendered.
let current = readState(location.search);
let loadRequest = null; // the list request that is running now, so a newer one can cancel it
let reviewRequest = null; // the same for the review panel
let searchTimer = null;
let pageCount = Number(pagination.querySelector('[data-pages]').textContent);

// "?status=pending&q=abc&page=2&article=ID" -> { status, q, page, article }
function readState(search) {
    const params = new URLSearchParams(search);
    return {
        status: params.get('status') || '',
        q: params.get('q') || '',
        page: Math.max(1, parseInt(params.get('page'), 10) || 1),
        article: params.get('article') || '',
    };
}

// { status, q, page, article } -> "status=pending&q=abc&page=2&article=ID" (empty values are left out)
function toQueryString({ status, q, page, article }) {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (q) params.set('q', q);
    if (page > 1) params.set('page', String(page));
    if (article) params.set('article', article);
    return params.toString();
}

// The address shown in the browser, and the same link works without JavaScript.
function pageUrl(state) {
    const queryString = toQueryString(state);
    return queryString ? `/editor?${queryString}` : '/editor';
}

// Sends a request to the API. Returns { response, data }, or null when the session ended.
async function callApi(url, options = {}) {
    const response = await fetch(url, {
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        ...options,
    });
    if (response.status === 401) {
        location.href = '/login'; // the session ended
        return null;
    }
    return { response, data: await response.json() };
}

// ---------- drawing the list ----------

function showMessage(text) {
    const item = document.createElement('li');
    item.className = 'queue-empty';
    item.textContent = text;
    queueList.replaceChildren(item);
}

// Copies the template item and writes the article's text into the data-field elements.
// textContent is used (never innerHTML), so a title can't inject HTML into the page.
function buildItem(article) {
    const item = itemTemplate.content.firstElementChild.cloneNode(true);
    for (const element of item.querySelectorAll('[data-field]')) {
        element.textContent = article[element.dataset.field];
    }
    const link = item.querySelector('[data-queue-link]');
    link.href = pageUrl({ ...current, article: article.id });
    link.dataset.id = article.id;
    item.querySelector('.status-badge').className = `status-badge is-${article.stateTone}`;
    return item;
}

function renderRows(rows, state) {
    if (rows.length === 0) {
        const messageName = state.q || state.status ? 'messageFiltered' : 'messageEmpty';
        showMessage(queueList.dataset[messageName]);
        return;
    }
    queueList.replaceChildren(...rows.map(buildItem));
    markSelected();
}

// Highlights the list item of the article that is open in the review panel.
function markSelected() {
    for (const link of queueList.querySelectorAll('[data-queue-link]')) {
        const isSelected = link.dataset.id === current.article;
        link.classList.toggle('is-selected', isSelected);
        if (isSelected) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
    }
}

// The numbers on the chips and on the "waiting" badge.
function renderCounts(counts) {
    for (const link of filterLinks) {
        link.querySelector('[data-count]').textContent = counts[link.dataset.status || 'all'];
    }
    pendingBadge.querySelector('[data-count]').textContent = counts.pending;
}

function renderFilters(state) {
    for (const link of filterLinks) {
        const isActive = link.dataset.status === state.status;
        link.classList.toggle('is-active', isActive);
        if (isActive) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
        // Chips keep the search text and the open article, and always start from page 1.
        link.href = pageUrl({ status: link.dataset.status, q: state.q, page: 1, article: state.article });
    }
    statusInput.value = state.status;
    articleInput.value = state.article;
}

function renderPagination(state) {
    const [previousLink, nextLink] = pageLinks;
    pagination.hidden = pageCount <= 1;
    pagination.querySelector('[data-page]').textContent = state.page;
    pagination.querySelector('[data-pages]').textContent = pageCount;

    previousLink.hidden = state.page <= 1;
    previousLink.href = pageUrl({ ...state, page: state.page - 1 });
    nextLink.hidden = state.page >= pageCount;
    nextLink.href = pageUrl({ ...state, page: state.page + 1 });
}

// ---------- loading the list ----------

// Asks the API for `wanted`, draws the answer, and (unless it came from the back button)
// adds the new address to the browser history.
async function load(wanted, { pushHistory = true, updateInput = false } = {}) {
    if (loadRequest) loadRequest.abort(); // only the newest request counts
    const request = new AbortController();
    loadRequest = request;
    queueBox.setAttribute('aria-busy', 'true');

    try {
        const result = await callApi(`/api/editor/articles?${toQueryString(wanted)}`, { signal: request.signal });
        if (!result) return;
        if (!result.response.ok) throw new Error(`The server answered ${result.response.status}`);
        const { data } = result;

        // The server tells us which filters it really used (bad values are ignored).
        current = { status: data.status, q: data.q, page: data.page, article: wanted.article };
        pageCount = data.pages;
        totalText.textContent = data.total;
        renderRows(data.rows, current);
        renderCounts(data.counts);
        renderFilters(current);
        renderPagination(current);
        if (updateInput) searchInput.value = current.q; // only for the back button; never while typing
        if (pushHistory) history.pushState(null, '', pageUrl(current));
    } catch (err) {
        if (err.name === 'AbortError') return; // a newer request replaced this one
        console.error('Loading the articles failed:', err);
        showMessage(queueList.dataset.messageError);
    } finally {
        if (loadRequest === request) {
            loadRequest = null;
            queueBox.removeAttribute('aria-busy');
        }
    }
}

// Reloads the list the user is looking at (after a decision changed the counts and the states).
function reloadList() {
    return load(current, { pushHistory: false });
}

// ---------- the review panel ----------

function showReviewError(message) {
    reviewError.textContent = message;
    reviewError.hidden = false;
}

function errorMessageFor(data) {
    return reasonMessages[data.reason] || data.error || 'אירעה שגיאה. נסו שוב.';
}

// Writes one version (published or new) into its column, or hides the column when there is none.
function renderVersion(key, version) {
    const column = review.querySelector(`[data-version="${key}"]`);
    column.hidden = !version;
    if (!version) return;

    for (const element of column.querySelectorAll('[data-version-field]')) {
        element.textContent = version[element.dataset.versionField];
    }
    const image = column.querySelector('[data-version-image]');
    image.hidden = !version.imageUrl;
    image.src = version.imageUrl; // the server only keeps http(s) links
    // The article text is HTML that the server already cleaned (only a few safe tags are left).
    column.querySelector('[data-version-html]').innerHTML = version.contentHtml;
}

// Fills the review panel from what GET /api/editor/articles/:id (or an action) returned.
function renderReview(data) {
    for (const element of review.querySelectorAll('[data-field]')) {
        element.textContent = data[element.dataset.field];
    }
    review.querySelector('.status-badge').className = `status-badge is-${data.stateTone}`;
    review.dataset.articleId = data.id;

    renderVersion('published', data.published);
    renderVersion('draft', data.draft);

    publishButton.hidden = !data.canReview;
    returnButton.hidden = !data.canReview;
    returnBox.hidden = !data.canReview;
    editLink.hidden = !data.canEdit;
    editLink.href = data.editUrl;
    returnedNote.hidden = !data.returnedNote;

    noteInput.value = '';
    reviewError.hidden = true;
    reviewEmpty.hidden = true;
    review.hidden = false;
}

function hideReview() {
    review.hidden = true;
    reviewEmpty.hidden = false;
}

// Opens an article in the review panel and puts it in the address.
// `pushHistory` is false when the browser's back button asked for it.
async function openArticle(id, { pushHistory = true } = {}) {
    if (reviewRequest) reviewRequest.abort(); // only the newest request counts
    const request = new AbortController();
    reviewRequest = request;

    try {
        const result = await callApi(`/api/editor/articles/${id}`, { signal: request.signal });
        if (!result) return;
        if (!result.response.ok) {
            showReviewError(errorMessageFor(result.data));
            review.hidden = false;
            reviewEmpty.hidden = true;
            return;
        }
        current = { ...current, article: id };
        renderReview(result.data.review);
        articleInput.value = id;
        markSelected();
        // The chips and the paging links keep the open article in their address.
        renderFilters(current);
        renderPagination(current);
        if (pushHistory) history.pushState(null, '', pageUrl(current));
    } catch (err) {
        if (err.name === 'AbortError') return; // a newer request replaced this one
        console.error('Loading the article failed:', err);
        showReviewError('אירעה שגיאה בטעינת הכתבה. נסו שוב.');
    } finally {
        if (reviewRequest === request) reviewRequest = null;
    }
}

// ---------- decisions ----------

// Sends one decision for the open article. `onDone` gets the answer when the server accepted it.
async function decide(button, url, options, onDone) {
    reviewError.hidden = true;
    button.disabled = true;
    try {
        const result = await callApi(url, options);
        if (!result) return;
        if (!result.response.ok) {
            showReviewError(errorMessageFor(result.data));
            return;
        }
        onDone(result.data);
        reloadList();
    } catch (err) {
        console.error('The action failed:', err);
        showReviewError('אירעה שגיאה. נסו שוב.');
    } finally {
        button.disabled = false;
    }
}

function articleApiUrl() {
    return `/api/editor/articles/${review.dataset.articleId}`;
}

publishButton.addEventListener('click', () => {
    decide(publishButton, `${articleApiUrl()}/publish`, { method: 'POST', body: '{}' }, data => renderReview(data.review));
});

returnButton.addEventListener('click', () => {
    const note = noteInput.value.trim();
    if (note === '') {
        showReviewError('יש לכתוב לכתב/ת הערה לפני שמחזירים את הכתבה לתיקונים.');
        noteInput.focus();
        return;
    }
    decide(returnButton, `${articleApiUrl()}/return`, { method: 'POST', body: JSON.stringify({ note }) }, data => renderReview(data.review));
});

// Delete asks for confirmation first, because it can't be undone.
deleteButton.addEventListener('click', () => {
    reviewError.hidden = true;
    deleteDialog.showModal();
});

deleteCancel.addEventListener('click', () => deleteDialog.close());

// Clicking the dark area around the box closes it too.
deleteDialog.addEventListener('click', event => {
    if (event.target === deleteDialog) deleteDialog.close();
});

deleteConfirm.addEventListener('click', async () => {
    deleteConfirm.disabled = true;
    await decide(deleteButton, articleApiUrl(), { method: 'DELETE', body: '{}' }, () => {
        current = { ...current, article: '' };
        hideReview();
        history.replaceState(null, '', pageUrl(current));
    });
    deleteConfirm.disabled = false;
    deleteDialog.close(); // errors are shown on the page behind the dialog
});

// ---------- events ----------

// Search: while typing (after a short pause) and on Enter. Emptying the box clears the query too.
function searchNow() {
    clearTimeout(searchTimer);
    const q = searchInput.value.trim();
    if (q === current.q) return; // nothing changed
    load({ ...current, q, page: 1 });
}

searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(searchNow, SEARCH_DELAY_MS);
});

searchForm.addEventListener('submit', event => {
    event.preventDefault();
    searchNow();
});

// The list items, the filter chips and the previous / next buttons are real links, so they also work
// without JavaScript, in a new tab, and by middle click. A plain left click is handled here instead.
document.addEventListener('click', event => {
    const link = event.target.closest('[data-queue-link], [data-filter-link], [data-page-link]');
    if (!link) return;
    const plainLeftClick = event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
    if (!plainLeftClick) return;

    event.preventDefault();
    if (link.matches('[data-queue-link]')) openArticle(link.dataset.id);
    else load(readState(new URL(link.href).search));
});

// Back and forward buttons: show the list and the article that belong to the address.
window.addEventListener('popstate', () => {
    const state = readState(location.search);
    load(state, { pushHistory: false, updateInput: true });
    if (state.article) openArticle(state.article, { pushHistory: false });
    else hideReview();
});

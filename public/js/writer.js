// Client script for the writer page (views/writer.ejs).
// The server renders the first page. From there the status filters, the search box and the
// paging buttons load their data from GET /api/writer/articles with fetch, so the page never reloads.

const tableBody = document.getElementById('articles-body');
const tableWrap = document.getElementById('articles-wrap');
const rowTemplate = document.getElementById('article-row-template');
const searchForm = document.getElementById('writer-search');
const searchInput = document.getElementById('writer-search-input');
const statusInput = searchForm.elements.status;
const filterLinks = document.querySelectorAll('[data-filter-link]');
const pagination = document.getElementById('writer-pagination');
const pageLinks = pagination.querySelectorAll('[data-page-link]'); // [previous, next]

const SEARCH_DELAY_MS = 300;

// The list the user is looking at. It starts from the URL the server rendered.
let current = readState(location.search);
let loadRequest = null; // the request that is running now, so a newer one can cancel it
let searchTimer = null;

// "?status=draft&q=abc&page=2" -> { status, q, page }
function readState(search) {
    const params = new URLSearchParams(search);
    return {
        status: params.get('status') || '',
        q: params.get('q') || '',
        page: Math.max(1, parseInt(params.get('page'), 10) || 1),
    };
}

// { status, q, page } -> "status=draft&q=abc&page=2" (empty values are left out)
function toQueryString({ status, q, page }) {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (q) params.set('q', q);
    if (page > 1) params.set('page', String(page));
    return params.toString();
}

// The address shown in the browser, and the same link works without JavaScript.
function pageUrl(state) {
    const queryString = toQueryString(state);
    return queryString ? `/writer?${queryString}` : '/writer';
}

// ---------- drawing the answer ----------

function showMessage(text) {
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.className = 'articles-empty';
    cell.textContent = text;
    const row = document.createElement('tr');
    row.append(cell);
    tableBody.replaceChildren(row);
}

// Copies the template row and writes the article's text into the data-field elements.
// textContent is used (never innerHTML), so a title can't inject HTML into the page.
function buildRow(article) {
    const row = rowTemplate.content.firstElementChild.cloneNode(true);
    for (const element of row.querySelectorAll('[data-field]')) {
        element.textContent = article[element.dataset.field];
    }
    row.querySelector('.status-badge').className = `status-badge is-${article.stateTone}`;
    row.querySelector('[data-edit-link]').href = article.editUrl;
    return row;
}

function renderRows(rows, state) {
    if (rows.length === 0) {
        const messageName = state.q || state.status ? 'messageFiltered' : 'messageEmpty';
        showMessage(tableBody.dataset[messageName]);
        return;
    }
    tableBody.replaceChildren(...rows.map(buildRow));
}

function renderFilters(state) {
    for (const link of filterLinks) {
        const isActive = link.dataset.status === state.status;
        link.classList.toggle('is-active', isActive);
        if (isActive) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
        // Chips keep the search text, and always start from page 1.
        link.href = pageUrl({ status: link.dataset.status, q: state.q, page: 1 });
    }
    statusInput.value = state.status;
}

function renderPagination(state, pages) {
    const [previousLink, nextLink] = pageLinks;
    pagination.hidden = pages <= 1;
    pagination.querySelector('[data-page]').textContent = state.page;
    pagination.querySelector('[data-pages]').textContent = pages;

    previousLink.hidden = state.page <= 1;
    previousLink.href = pageUrl({ ...state, page: state.page - 1 });
    nextLink.hidden = state.page >= pages;
    nextLink.href = pageUrl({ ...state, page: state.page + 1 });
}

// ---------- loading ----------

// Asks the API for `wanted`, draws the answer, and (unless it came from the back button)
// adds the new address to the browser history.
async function load(wanted, { pushHistory = true, updateInput = false } = {}) {
    if (loadRequest) loadRequest.abort(); // only the newest request counts
    const request = new AbortController();
    loadRequest = request;
    tableWrap.setAttribute('aria-busy', 'true');

    try {
        const response = await fetch(`/api/writer/articles?${toQueryString(wanted)}`, {
            headers: { Accept: 'application/json' },
            signal: request.signal,
        });
        if (response.status === 401) {
            location.href = '/login'; // the session ended
            return;
        }
        if (!response.ok) throw new Error(`The server answered ${response.status}`);
        const data = await response.json();

        // The server tells us which filters it really used (bad values are ignored).
        current = { status: data.status, q: data.q, page: data.page };
        renderRows(data.rows, current);
        renderFilters(current);
        renderPagination(current, data.pages);
        if (updateInput) searchInput.value = current.q; // only for the back button; never while typing
        if (pushHistory) history.pushState(null, '', pageUrl(current));
    } catch (err) {
        if (err.name === 'AbortError') return; // a newer request replaced this one
        console.error('Loading the articles failed:', err);
        showMessage(tableBody.dataset.messageError);
    } finally {
        if (loadRequest === request) {
            loadRequest = null;
            tableWrap.removeAttribute('aria-busy');
        }
    }
}

// ---------- events ----------

// Search: while typing (after a short pause) and on Enter. Emptying the box clears the query too.
function searchNow() {
    clearTimeout(searchTimer);
    const q = searchInput.value.trim();
    if (q === current.q) return; // nothing changed
    load({ status: current.status, q, page: 1 });
}

searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(searchNow, SEARCH_DELAY_MS);
});

searchForm.addEventListener('submit', event => {
    event.preventDefault();
    searchNow();
});

// Filter chips and the previous / next buttons are real links, so they also work without
// JavaScript, in a new tab, and by middle click. A plain left click is handled here instead.
document.addEventListener('click', event => {
    const link = event.target.closest('[data-filter-link], [data-page-link]');
    if (!link) return;
    const plainLeftClick = event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
    if (!plainLeftClick) return;

    event.preventDefault();
    load(readState(new URL(link.href).search));
});

// Back and forward buttons: show the list that belongs to the address.
window.addEventListener('popstate', () => {
    load(readState(location.search), { pushHistory: false, updateInput: true });
});

document.addEventListener('DOMContentLoaded', () => {
    const el = id => document.getElementById(id);
    const articleSelect = el('analytics-article');
    const rangeSelect = el('analytics-range');
    const canvas = el('views-chart');
    const context = canvas.getContext('2d');
    const number = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 2 });
    const time = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' });
    const dateTime = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const shortDate = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit' });
    let data = null;
    let selectedEvent = -1;
    let activeRequest = null;
    let listRequest = null;
    let searchTimeout;
    let geometry = null;

    const formatDate = value => dateTime.format(new Date(value));
    const setText = (id, value) => { el(id).textContent = value; };
    const eventLabel = event => event.kind === 'publication' ? 'פרסום ראשון' : `עדכון ${event.number} פורסם`;
    const history = () => data?.publicationHistory || data?.events || [];

    function clearDisplay() {
        data = null;
        geometry = null;
        el('chart-tooltip').hidden = true;
        ['period-views', 'total-views', 'update-count', 'peak-views', 'before-rate', 'after-rate', 'change-rate'].forEach(id => setText(id, '—'));
        ['before-window', 'after-window'].forEach(id => setText(id, ''));
        el('publish-events').replaceChildren();
        el('analytics-table').replaceChildren();
        setText('impact-summary', 'טוען נתוני צפייה…');
        drawChart();
    }

    function updateUrl() {
        const url = new URL(window.location.href);
        url.searchParams.set('article', articleSelect.value);
        url.searchParams.set('range', rangeSelect.value);
        window.history.replaceState(null, '', url.pathname + url.search);
    }

    async function loadAnalytics(silent = false) {
        if (!articleSelect.value || (silent && activeRequest)) return;
        if (activeRequest) activeRequest.abort();
        const request = new AbortController();
        activeRequest = request;
        el('analytics-main').setAttribute('aria-busy', 'true');
        el('analytics-retry').hidden = true;
        el('analytics-status').classList.remove('is-error');
        if (!silent) {
            clearDisplay();
            el('export-report').disabled = true;
            setText('analytics-status', 'טוען נתוני צפייה…');
        }
        try {
            const url = `/api/editor/articles/${encodeURIComponent(articleSelect.value)}/analytics?range=${encodeURIComponent(rangeSelect.value)}`;
            const response = await fetch(url, { signal: request.signal, cache: 'no-store' });
            if (!response.ok) throw new Error(response.status === 401 ? 'יש להתחבר מחדש כדי לצפות בנתונים.' : 'לא ניתן לטעון את נתוני הצפייה. נסו שוב.');
            const result = await response.json();
            if (activeRequest !== request) return;
            const previousEventAt = silent && history()[selectedEvent]?.at;
            data = result;
            selectedEvent = previousEventAt ? history().findIndex(event => event.at === previousEventAt) : -1;
            if (selectedEvent < 0) selectedEvent = history().findLastIndex(event => event.kind === 'update' && event.inRange !== false);
            renderData();
            el('export-report').disabled = false;
            setText('analytics-status', `עודכן ב־${time.format(new Date())} · שעות לפי שעון ישראל`);
            updateUrl();
        } catch (error) {
            if (error.name === 'AbortError' || activeRequest !== request) return;
            setText('analytics-status', error instanceof TypeError ? 'החיבור לשרת נכשל. נסו שוב.' : error.message);
            el('analytics-status').classList.add('is-error');
            el('analytics-retry').hidden = false;
        } finally {
            if (activeRequest === request) {
                activeRequest = null;
                el('analytics-main').setAttribute('aria-busy', 'false');
            }
        }
    }

    function renderData() {
        const metadata = [`מאת ${data.article.writer}`];
        if (data.article.createdAt) metadata.push(`נוצרה ${formatDate(data.article.createdAt)}`);
        metadata.push(`פורסמה ${formatDate(data.article.publishedAt)}`);
        if (data.article.lastPublishedUpdateAt) metadata.push(`עדכון מאושר אחרון ${formatDate(data.article.lastPublishedUpdateAt)}`);
        setText('article-meta', metadata.join(' · '));
        setText('period-views', number.format(data.metrics.periodViews));
        setText('total-views', number.format(data.article.totalViews));
        setText('update-count', number.format(data.metrics.updates));
        setText('peak-views', number.format(data.metrics.peakViewsPerMinute));
        setText('chart-resolution', `צפיות בכל ${data.intervalMinutes} דקות · נקודות הפרסום מסומנות על הגרף`);
        setText('tracking-note', data.article.trackingStartedAt
            ? `איסוף נתוני זמן החל ב־${formatDate(data.article.trackingStartedAt)}. מקטעים לפני תחילת האיסוף אינם מוצגים כצפיות אפס. המקטע האחרון עשוי להיות חלקי.`
            : 'טרם נאספו נתוני זמן לכתבה. צפיות חדשות יופיעו כאן; צפיות ישנות אינן משוחזרות לגרף.');
        const list = el('publish-events');
        list.replaceChildren();
        if (!history().length) {
            const item = document.createElement('li');
            item.className = 'analytics-note';
            item.textContent = 'אין היסטוריית פרסום לכתבה.';
            list.append(item);
        }
        history().forEach((event, index) => {
            const item = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'analytics-event';
            button.setAttribute('aria-pressed', String(index === selectedEvent));
            const title = document.createElement('strong');
            title.textContent = eventLabel(event);
            const meta = document.createElement('small');
            meta.textContent = `${formatDate(event.at)} · ${event.editor}${event.inRange === false ? ' · מחוץ לטווח הגרף' : ''}`;
            button.append(title, meta);
            button.addEventListener('click', () => selectEvent(index));
            item.append(button);
            list.append(item);
        });
        const table = el('analytics-table');
        table.replaceChildren();
        const fragment = document.createDocumentFragment();
        data.points.forEach(point => {
            const row = document.createElement('tr');
            const events = data.events.filter(event => Number(new Date(event.at)) >= Number(new Date(point.at)) && Number(new Date(event.at)) < Number(new Date(point.to)));
            [formatDate(point.at), point.tracked ? number.format(point.views) : 'טרם נאספו נתונים', events.map(event => `${eventLabel(event)} · ${formatDate(event.at)}`).join('; ') || '—'].forEach(value => {
                const cell = document.createElement('td');
                cell.textContent = value;
                row.append(cell);
            });
            fragment.append(row);
        });
        table.append(fragment);
        renderComparison();
        drawChart();
    }

    function selectEvent(index) {
        selectedEvent = index;
        el('publish-events').querySelectorAll('button').forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
        renderComparison();
        drawChart();
    }

    function renderComparison() {
        const event = history()[selectedEvent];
        const comparison = event?.comparison;
        ['before-rate', 'after-rate', 'change-rate'].forEach(id => setText(id, '—'));
        ['before-window', 'after-window'].forEach(id => setText(id, ''));
        if (event?.inRange === false) {
            setText('impact-summary', `${eventLabel(event)} ב־${formatDate(event.at)} נמצא מחוץ לטווח הגרף. בחרו “מאז הפרסום הראשון” כדי להציג אותו על ציר הזמן.`);
            return;
        }
        if (!comparison) {
            setText('impact-summary', event?.kind === 'publication'
                ? 'זהו הפרסום הראשון. בחרו עדכון מאוחר יותר כדי להשוות צפיות לפני ואחרי.'
                : history().some(event => event.kind === 'update')
                    ? 'העדכונים נמצאים מחוץ לטווח הגרף. בחרו “מאז הפרסום הראשון” להצגת ההיסטוריה המלאה.'
                    : 'לא פורסמו עדכונים לכתבה.');
            return;
        }
        for (const [key, prefix] of [['before', 'before'], ['after', 'after']]) {
            const window = comparison[key];
            setText(`${prefix}-rate`, window.viewsPerMinute === null ? '—' : number.format(window.viewsPerMinute));
            setText(`${prefix}-window`, window.durationMinutes > 0
                ? `${window.views} צפיות ב־${window.durationMinutes} דקות · ${formatDate(window.from)}–${formatDate(window.to)}`
                : 'אין עדיין דקות מלאות להשוואה');
        }
        if (!comparison.comparable) {
            setText('impact-summary', `${eventLabel(event)} ב־${formatDate(event.at)}. חסרים נתונים לפני העדכון או אחריו להשוואה.`);
        } else if (comparison.changePercent === null) {
            setText('impact-summary', 'לפני העדכון הקצב היה אפס; ניתן להשוות את הקצבים, אך אין אחוז שינוי מוגדר.');
        } else {
            const change = comparison.changePercent;
            setText('change-rate', `${change > 0 ? '+' : ''}${number.format(change)}%`);
            setText('impact-summary', `${eventLabel(event)} ב־${formatDate(event.at)} · קצב הצפיות ${change > 0 ? 'עלה' : change < 0 ? 'ירד' : 'נותר ללא שינוי'}${change === 0 ? '.' : ` ב־${number.format(Math.abs(change))}% בחלונות שנמדדו.`}`);
        }
    }

    function drawChart() {
        if (!context) return;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (!width || !height) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.clearRect(0, 0, width, height);
        context.font = '11px Arial';
        if (!data) {
            context.fillStyle = '#7c837e';
            context.textAlign = 'center';
            context.fillText(articleSelect.value ? 'הגרף יופיע לאחר טעינת הנתונים' : 'אין כתבה נבחרת', width / 2, height / 2);
            return;
        }
        const compactDates = width < 500 && data.range !== '24h';
        const plot = { left: 48, right: width - 16, top: 44, bottom: height - (compactDates ? 52 : 44) };
        const from = Number(new Date(data.from));
        const to = Number(new Date(data.to));
        const maximum = Math.max(1, ...data.points.map(point => point.views));
        const step = Math.max(1, Math.ceil(maximum / 4));
        const maxY = step * 4;
        const x = at => plot.left + (Number(new Date(at)) - from) / (to - from) * (plot.right - plot.left);
        const y = count => plot.bottom - count / maxY * (plot.bottom - plot.top);
        geometry = { plot, x, from, to };
        context.lineWidth = 1;
        context.textAlign = 'right';
        for (let i = 0; i <= 4; i++) {
            const value = i * step;
            context.strokeStyle = '#e5e7e4';
            context.beginPath(); context.moveTo(plot.left, y(value)); context.lineTo(plot.right, y(value)); context.stroke();
            context.fillStyle = '#7c837e'; context.fillText(number.format(value), plot.left - 9, y(value) + 4);
        }
        context.fillStyle = '#555b57';
        context.textAlign = 'left';
        context.fillText('צפיות', 4, 19);
        // Measure the actual labels, including the edge anchors, before choosing
        // a tick count. Narrow charts use separate short date and time lines.
        let labels;
        for (let ticks = 5; ticks >= 1; ticks--) {
            labels = Array.from({ length: ticks + 1 }, (_, i) => {
                const at = from + (to - from) * i / ticks;
                const date = new Date(at);
                const lines = compactDates ? [shortDate.format(date), time.format(date)]
                    : [(data.range === '24h' ? time : dateTime).format(date)];
                const labelWidth = Math.max(...lines.map(line => context.measureText(line).width));
                const position = x(at);
                const align = i === 0 ? 'left' : i === ticks ? 'right' : 'center';
                const left = position - (align === 'right' ? labelWidth : align === 'center' ? labelWidth / 2 : 0);
                return { lines, position, align, left, right: left + labelWidth };
            });
            if (labels.every((label, i) => i === 0 || label.left >= labels[i - 1].right + 12)) break;
        }
        labels.forEach(label => {
            context.textAlign = label.align;
            context.fillStyle = '#7c837e';
            label.lines.forEach((line, index) => context.fillText(line, label.position,
                compactDates ? height - 28 + index * 16 : height - 18));
        });
        const tracked = data.points.filter(point => point.tracked);
        if (tracked.length) {
            context.strokeStyle = '#e53935'; context.lineWidth = 2.5;
            context.beginPath();
            tracked.forEach((point, index) => {
                // Position each count at the middle of its interval.
                const at = (Number(new Date(point.at)) + Number(new Date(point.to))) / 2;
                if (index === 0) context.moveTo(x(at), y(point.views)); else context.lineTo(x(at), y(point.views));
            });
            context.stroke();
            if (tracked.length === 1) {
                const point = tracked[0]; context.fillStyle = '#e53935'; context.beginPath();
                context.arc(x((Number(new Date(point.at)) + Number(new Date(point.to))) / 2), y(point.views), 4, 0, Math.PI * 2); context.fill();
            }
        } else {
            context.fillStyle = '#7c837e'; context.textAlign = 'center';
            context.fillText('טרם נאספו נתוני צפייה בטווח הזה', (plot.left + plot.right) / 2, (plot.top + plot.bottom) / 2);
        }
        data.events.forEach((event, index) => {
            const position = x(event.at);
            const selected = event.at === history()[selectedEvent]?.at;
            context.strokeStyle = selected ? '#164786' : '#7095c8';
            context.lineWidth = selected ? 2 : 1;
            context.setLineDash([4, 4]); context.beginPath(); context.moveTo(position, plot.top); context.lineTo(position, plot.bottom); context.stroke(); context.setLineDash([]);
            if (data.events.length <= 6 || selected) {
                const label = `${event.kind === 'update' ? 'עדכון' : 'פרסום'} ${time.format(new Date(event.at))}`;
                context.font = 'bold 11px Arial';
                const boxWidth = context.measureText(label).width + 16;
                const left = Math.min(plot.right - boxWidth, Math.max(plot.left, position - boxWidth / 2));
                const top = index % 2 === 0 ? 2 : 22;
                context.fillStyle = '#e8f0fc'; context.fillRect(left, top, boxWidth, 19);
                context.textAlign = 'center'; context.fillStyle = '#245aa6'; context.fillText(label, left + boxWidth / 2, top + 13);
                context.font = '11px Arial';
            }
        });
        canvas.setAttribute('aria-label', `גרף ${data.metrics.periodViews} צפיות בטווח שנבחר, עם ${data.events.length} נקודות פרסום. הנתונים המלאים בטבלה שמתחת לגרף.`);
    }

    function nearestEvent(position) {
        let nearest = -1;
        let distance = 16;
        data.events.forEach((event, index) => {
            const nextDistance = Math.abs(geometry.x(event.at) - position);
            if (nextDistance < distance) { nearest = index; distance = nextDistance; }
        });
        return nearest;
    }
    canvas.addEventListener('pointermove', event => {
        if (!data || !geometry) return;
        const position = event.clientX - canvas.getBoundingClientRect().left;
        if (position < geometry.plot.left || position > geometry.plot.right) { el('chart-tooltip').hidden = true; return; }
        const eventIndex = nearestEvent(position);
        const at = geometry.from + (position - geometry.plot.left) / (geometry.plot.right - geometry.plot.left) * (geometry.to - geometry.from);
        const point = data.points.find(point => at >= Number(new Date(point.at)) && at <= Number(new Date(point.to)));
        el('chart-tooltip').textContent = eventIndex >= 0
            ? `${eventLabel(data.events[eventIndex])} · ${formatDate(data.events[eventIndex].at)}`
            : point ? `${formatDate(point.at)}–${time.format(new Date(point.to))} · ${point.tracked ? `${point.views} צפיות` : 'טרם נאספו נתונים'}` : '';
        el('chart-tooltip').hidden = false;
    });
    canvas.addEventListener('pointerleave', () => { el('chart-tooltip').hidden = true; });
    canvas.addEventListener('click', event => {
        if (!data || !geometry) return;
        const index = nearestEvent(event.clientX - canvas.getBoundingClientRect().left);
        if (index >= 0) selectEvent(history().findIndex(event => event.at === data.events[index].at));
    });
    if ('ResizeObserver' in window) new ResizeObserver(drawChart).observe(canvas.parentElement);
    else window.addEventListener('resize', drawChart);

    async function loadArticles() {
        if (listRequest) listRequest.abort();
        const request = new AbortController();
        listRequest = request;
        const params = new URLSearchParams({ q: el('analytics-search').value.trim() });
        try {
            const response = await fetch(`/api/editor/analytics/articles?${params}`, { signal: request.signal });
            if (!response.ok) throw new Error('לא ניתן לחפש כתבות כרגע. נסו שוב.');
            const result = await response.json();
            if (listRequest !== request) return;
            const selected = articleSelect.selectedOptions[0]?.cloneNode(true);
            articleSelect.replaceChildren();
            if (selected) articleSelect.append(selected);
            result.articles.forEach(article => {
                if ([...articleSelect.options].some(option => option.value === article.id)) return;
                const option = document.createElement('option');
                option.value = article.id; option.textContent = article.title; articleSelect.append(option);
            });
            articleSelect.disabled = !articleSelect.options.length;
            setText('article-search-status', result.total ? `${result.total} כתבות תואמות. בחרו כתבה מהרשימה; הכתבה הנבחרת נשמרת בראש הרשימה.` : 'לא נמצאו כתבות תואמות. הכתבה הנבחרת נשמרת.');
            if (!selected && result.articles.length) loadAnalytics();
        } catch (error) {
            if (error.name !== 'AbortError' && listRequest === request) setText('article-search-status', 'לא ניתן לחפש כתבות כרגע. נסו שוב.');
        } finally {
            if (listRequest === request) listRequest = null;
        }
    }

    el('analytics-search').addEventListener('input', () => {
        clearTimeout(searchTimeout);
        // Stop an old result from repopulating the selector during the debounce delay.
        if (listRequest) { listRequest.abort(); listRequest = null; }
        searchTimeout = setTimeout(() => loadArticles(), 300);
    });
    articleSelect.addEventListener('change', () => loadAnalytics());
    rangeSelect.addEventListener('change', () => loadAnalytics());
    el('analytics-retry').addEventListener('click', () => loadAnalytics());
    el('export-report').addEventListener('click', () => {
        if (!data) return;
        const cell = value => {
            const text = String(value ?? '');
            return `"${(/^[=+\-@]/.test(text) ? "'" : '') + text.replace(/"/g, '""')}"`;
        };
        const rows = [['כתבה', data.article.title], ['מזהה', data.article.id], ['אזור זמן', 'Asia/Jerusalem'],
            ['תחילת מקטע (ISO UTC)', 'סוף מקטע (ISO UTC)', 'צפיות', 'אירועים']];
        data.points.forEach(point => rows.push([point.at, point.to, point.tracked ? point.views : '',
            data.events.filter(event => Number(new Date(event.at)) >= Number(new Date(point.at)) && Number(new Date(event.at)) < Number(new Date(point.to)))
                .map(event => `${eventLabel(event)} ${event.at}`).join('; ')]));
        const blob = new Blob(['\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = `impact-${data.article.id}-${data.range}.csv`;
        document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    const initialRange = new URLSearchParams(window.location.search).get('range');
    if (['24h', '7d', '30d', 'all'].includes(initialRange)) rangeSelect.value = initialRange;
    if (articleSelect.value) loadAnalytics(); else drawChart();
    setInterval(() => { if (!document.hidden) loadAnalytics(true); }, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) loadAnalytics(true); });
});

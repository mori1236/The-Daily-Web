// Formatting helpers for text shown in the UI (dates, counts, greetings).

const TIME_ZONE = 'Asia/Jerusalem';
const DAY_MS = 24 * 60 * 60 * 1000;

// Date parts in the newsroom's time zone, so the page looks the same wherever the server runs.
const partsFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});

function dateParts(date) {
    const parts = {};
    for (const { type, value } of partsFormatter.formatToParts(date)) parts[type] = value;
    return { ...parts, dayKey: `${parts.year}-${parts.month}-${parts.day}` };
}

// "היום, 09:24" / "אתמול, 18:42" / "25.09, 16:15"
function formatUpdated(date, now) {
    const d = dateParts(date);
    const time = `${d.hour}:${d.minute}`;
    if (d.dayKey === dateParts(now).dayKey) return `היום, ${time}`;
    if (d.dayKey === dateParts(new Date(now.getTime() - DAY_MS)).dayKey) return `אתמול, ${time}`;
    return `${d.day}.${d.month}, ${time}`;
}

// "09:42"
function formatTime(date) {
    const d = dateParts(date);
    return `${d.hour}:${d.minute}`;
}

// 24800 -> "24.8K"
function formatCount(number) {
    if (number < 1000) return String(number);
    return `${(number / 1000).toFixed(1).replace(/\.0$/, '')}K`;
}

function greetingFor(now) {
    const hour = Number(dateParts(now).hour);
    if (hour >= 5 && hour < 12) return 'בוקר טוב';
    if (hour >= 12 && hour < 17) return 'צהריים טובים';
    if (hour >= 17 && hour < 22) return 'ערב טוב';
    return 'לילה טוב';
}

// "יום שני · 28 בספטמבר"
function formatToday(now) {
    return new Intl.DateTimeFormat('he-IL', { timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long' })
        .format(now).replace(',', ' ·');
}

module.exports = { DAY_MS, formatUpdated, formatTime, formatCount, greetingFor, formatToday };

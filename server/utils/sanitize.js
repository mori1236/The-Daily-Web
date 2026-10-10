// Cleaning of text written by users, so it is safe to store and to show (XSS protection).
// Every article field passes through one of these three functions before it is saved.

const sanitizeHtml = require('sanitize-html');

const MAX_LENGTHS = { title: 150, summary: 300, content: 100000, imageUrl: 500 };

// The body of an article is HTML. Only these tags and attributes survive; the rest is removed.
const bodyOptions = {
    allowedTags: ['p', 'br', 'h2', 'h3', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'blockquote', 'a'],
    allowedAttributes: { a: ['href', 'rel'] },
    allowedSchemes: ['http', 'https', 'mailto'], // blocks javascript: and data: links
    allowedSchemesAppliedToAttributes: ['href'],
    // The browser's editor creates <b>, <i>, <div> and <h1>; turn them into the tags we allow.
    // Links always get rel="noopener noreferrer".
    transformTags: {
        b: 'strong',
        i: 'em',
        div: 'p',
        h1: 'h2',
        a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }),
    },
};

/** Article body: keeps only the allowed formatting tags. */
function sanitizeBody(html) {
    return sanitizeHtml(String(html || ''), bodyOptions).slice(0, MAX_LENGTHS.content);
}

/** Plain text (title, summary): no tags at all, trimmed and limited in length. */
function cleanText(text, maxLength) {
    return String(text || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

/** Image link: only http(s) addresses are allowed. Anything else becomes an empty string. */
function cleanUrl(text) {
    const value = String(text || '').trim().slice(0, MAX_LENGTHS.imageUrl);
    if (value === '') return '';
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
    } catch {
        return '';
    }
}

function hasBodyText(html) {
    const text = sanitizeHtml(String(html || ''), { allowedTags: [], allowedAttributes: {} });
    return text.replace(/&nbsp;/g, '').replace(/[\s\u200B-\u200F\uFEFF]/g, '').length > 0;
}

module.exports = { MAX_LENGTHS, sanitizeBody, cleanText, cleanUrl, hasBodyText };

// Helpers for the text search box. The search is "loose", not a typo-tolerant fuzzy search:
//  - every word the user typed must appear in the title, in any order
//  - Hebrew niqqud marks are ignored, and final letters (ך/כ, ם/מ ...), quotes and hyphens
//    that look alike are treated as the same character

const MAX_WORDS = 8;

// Hebrew niqqud and cantillation marks (U+0591 to U+05C7). They may appear after any letter.
const MARKS = `[${String.fromCharCode(0x591)}-${String.fromCharCode(0x5c7)}]`;
const MARKS_REGEX = new RegExp(MARKS, 'g');

// Characters that match each other, written as regex character classes.
const SIMILAR = {
    'כ': '[כך]', 'ך': '[כך]',
    'מ': '[מם]', 'ם': '[מם]',
    'נ': '[נן]', 'ן': '[נן]',
    'פ': '[פף]', 'ף': '[פף]',
    'צ': '[צץ]', 'ץ': '[צץ]',
    '"': '["״”“]', '״': '["״”“]',
    "'": "['׳’‘]", '׳': "['׳’‘]",
    '-': '[-־–]', '־': '[-־–]', '–': '[-־–]',
};

// A user typing "(" in the search box must not break the regular expression.
function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// One typed character -> its regex, allowing niqqud marks after it.
function charPattern(char) {
    return (SIMILAR[char] || escapeRegex(char)) + `${MARKS}*`;
}

/**
 * Turns the typed text into MongoDB conditions on `title`, one per word.
 * Use it as: filter.$and = titleSearchClauses(q)
 * @param {string} text
 * @returns {{ title: { $regex: string, $options: string } }[]}
 */
function titleSearchClauses(text) {
    const words = text.replace(MARKS_REGEX, '').split(/\s+/).filter(Boolean).slice(0, MAX_WORDS);
    return words.map(word => ({
        title: { $regex: [...word].map(charPattern).join(''), $options: 'i' },
    }));
}

module.exports = { titleSearchClauses };

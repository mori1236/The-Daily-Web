// Run with: npm test
// Checks the sanitizer against known XSS payloads. No test library is needed.

const assert = require('node:assert');
const { sanitizeBody, cleanText, cleanUrl } = require('./sanitize');

let passed = 0;
function check(name, actual, expected) {
    assert.strictEqual(actual, expected, name);
    passed++;
}

// ---- article body ----
check('keeps allowed formatting', sanitizeBody('<p>hi <strong>there</strong></p>'), '<p>hi <strong>there</strong></p>');
check('removes script tags and their content', sanitizeBody('<p>a</p><script>alert(1)</script>'), '<p>a</p>');
check('removes onerror handlers', sanitizeBody('<img src=x onerror=alert(1)>'), '');
check('removes onclick attributes', sanitizeBody('<p onclick="alert(1)">a</p>'), '<p>a</p>');
check('removes javascript: links', sanitizeBody('<a href="javascript:alert(1)">x</a>'), '<a rel="noopener noreferrer">x</a>');
check('removes JAVASCRIPT: links in capitals', sanitizeBody('<a href="JaVaScRiPt:alert(1)">x</a>'), '<a rel="noopener noreferrer">x</a>');
check('keeps https links and adds rel', sanitizeBody('<a href="https://a.com">x</a>'), '<a href="https://a.com" rel="noopener noreferrer">x</a>');
check('overrides a custom rel', sanitizeBody('<a href="https://a.com" rel="opener">x</a>'), '<a href="https://a.com" rel="noopener noreferrer">x</a>');
check('removes style attributes', sanitizeBody('<p style="x:expression(alert(1))">a</p>'), '<p>a</p>');
check('removes nested script trick', sanitizeBody('<scr<script>ipt>alert(1)</scr</script>ipt>'), 'ipt&gt;alert(1)ipt&gt;');
check('removes iframes', sanitizeBody('<iframe src="https://evil.com"></iframe>'), '');
check('turns div into p', sanitizeBody('<div>a</div>'), '<p>a</p>');
check('turns b and i into strong and em', sanitizeBody('<b>a</b><i>b</i>'), '<strong>a</strong><em>b</em>');
check('handles empty input', sanitizeBody(undefined), '');

// ---- plain text ----
check('text: removes angle brackets', cleanText('<b>Hello</b>', 100), 'bHello/b');
check('text: trims and limits length', cleanText('  abcdef  ', 3), 'abc');
check('text: handles non-strings', cleanText(undefined, 10), '');

// ---- image url ----
check('url: allows https', cleanUrl('https://a.com/x.jpg'), 'https://a.com/x.jpg');
check('url: blocks javascript:', cleanUrl('javascript:alert(1)'), '');
check('url: blocks data:', cleanUrl('data:text/html,<script>alert(1)</script>'), '');
check('url: blocks text that is not a url', cleanUrl('not a url'), '');
check('url: empty stays empty', cleanUrl(''), '');

console.log(`All ${passed} sanitizer checks passed`);

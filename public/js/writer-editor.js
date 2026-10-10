// Client script for the article editor (views/writer-editor.ejs), used by writers and editors.
// Saves the article automatically while the user types. Writers can also submit it for approval
// (editors have no submit button and no dialog, so that part is skipped).

const SAVE_DELAY_MS = 1500; // wait this long after the last keystroke before saving
const RETRY_DELAY_MS = 5000; // wait this long before trying again after a failed save

const editor = document.getElementById('editor');
const saveUrl = editor.dataset.saveUrl; // the writer and the editor save to different routes

const titleInput = document.getElementById('editor-title');
const summaryInput = document.getElementById('editor-summary');
const bodyBox = document.getElementById('editor-text');
const categorySelect = document.getElementById('editor-category');
const imageInput = document.getElementById('editor-image');
const imagePreview = document.getElementById('editor-image-preview');
const topbarTitle = document.getElementById('editor-topbar-title');
const stateBadge = document.getElementById('editor-state');
const saveStatus = document.getElementById('editor-save-status');
const saveText = document.getElementById('editor-save-text');
const submitButton = document.getElementById('editor-submit');
const errorBox = document.getElementById('editor-error');
const toolbar = document.getElementById('editor-toolbar');
const submitDialog = document.getElementById('submit-dialog');
const submitDialogCancel = document.getElementById('submit-dialog-cancel');
const submitDialogConfirm = document.getElementById('submit-dialog-confirm');

const fieldLabels = { title: 'כותרת', summary: 'תקציר', content: 'תוכן', category: 'קטגוריה' };

let changes = {}; // fields that changed and are not saved yet
let saveTimer = null;
let isSaving = false;

// ---------- messages ----------

function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
}

function clearError() {
    errorBox.hidden = true;
}

// kind: '' (saved), 'is-saving' or 'is-failed'
function setSaveStatus(text, kind) {
    saveText.textContent = text;
    saveStatus.classList.remove('is-saving', 'is-failed');
    if (kind) saveStatus.classList.add(kind);
}

// ---------- saving ----------

function scheduleSave(delay) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        saveTimer = null;
        save();
    }, delay);
}

function markChanged(field, value) {
    changes[field] = value;
    setSaveStatus('שומר…', 'is-saving');
    scheduleSave(SAVE_DELAY_MS);
}

// Sends the pending changes to the server. Returns true when everything is saved.
// keepalive lets the request finish even while the page is closing.
async function save(options = {}) {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (isSaving) return false; // the running save schedules another round when it ends
    if (Object.keys(changes).length === 0) return true;

    const sending = changes;
    changes = {};
    isSaving = true;
    try {
        const response = await fetch(saveUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sending),
            keepalive: Boolean(options.keepalive),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'השמירה נכשלה');

        stateBadge.textContent = data.stateLabel;
        stateBadge.className = `status-badge is-${data.stateTone}`;
        clearError();
        if (Object.keys(changes).length === 0) setSaveStatus(`כל השינויים נשמרו · ${data.savedAt}`, '');
        return true;
    } catch (err) {
        // Put the unsaved fields back (newer edits win) and try again soon.
        changes = { ...sending, ...changes };
        setSaveStatus('לא נשמר — מנסה שוב…', 'is-failed');
        scheduleSave(RETRY_DELAY_MS);
        return false;
    } finally {
        isSaving = false;
        // The writer kept typing while the request was running.
        if (Object.keys(changes).length > 0 && saveTimer === null) scheduleSave(SAVE_DELAY_MS);
    }
}

// Waits until the running save ends and all changes are saved.
async function saveEverything() {
    while (isSaving) await new Promise(resolve => setTimeout(resolve, 100));
    return save();
}

// ---------- fields ----------

titleInput.addEventListener('input', () => {
    topbarTitle.textContent = titleInput.value.trim() || 'כתבה ללא כותרת';
    markChanged('title', titleInput.value);
});

summaryInput.addEventListener('input', () => markChanged('summary', summaryInput.value));

function hasBodyText() {
    return bodyBox.textContent.replace(/[\s\u200B-\u200F\uFEFF]/g, '').length > 0;
}

function updateBodyPlaceholder() {
    // contenteditable can retain empty paragraphs and line breaks after deletion.
    bodyBox.classList.toggle('is-empty', !hasBodyText());
}

updateBodyPlaceholder();
bodyBox.addEventListener('input', () => {
    updateBodyPlaceholder();
    markChanged('content', bodyBox.innerHTML);
});

categorySelect.addEventListener('change', () => markChanged('category', categorySelect.value));

imageInput.addEventListener('input', () => {
    markChanged('imageUrl', imageInput.value);
    showImagePreview(imageInput.value.trim());
});

// Only http(s) links are shown as an image; the server checks this again.
function showImagePreview(url) {
    imagePreview.textContent = '';
    if (url.startsWith('http://') || url.startsWith('https://')) {
        const image = document.createElement('img');
        image.src = url;
        image.alt = titleInput.value;
        imagePreview.append(image);
    } else {
        imagePreview.textContent = 'אין תמונה';
    }
}

// Paste as plain text, so text copied from other sites brings no strange formatting.
bodyBox.addEventListener('paste', event => {
    event.preventDefault();
    const text = event.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
});

// ---------- formatting toolbar ----------

// mousedown would move the cursor out of the text before the button is clicked.
toolbar.addEventListener('mousedown', event => event.preventDefault());

toolbar.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || editor.dataset.canEdit !== 'true') return;

    const { command, value } = button.dataset;
    bodyBox.focus();

    if (command === 'createLink') {
        const url = prompt('כתובת הקישור (https://…)');
        if (!url || !/^(https?:\/\/|mailto:)/i.test(url.trim())) return;
        document.execCommand('createLink', false, url.trim());
    } else if (command === 'formatBlock') {
        document.execCommand('formatBlock', false, value);
    } else {
        document.execCommand(command, false, null);
    }
    updateBodyPlaceholder();
    markChanged('content', bodyBox.innerHTML);
});

// ---------- submit for approval ----------

if (submitButton) {
    // The button only asks for confirmation. The article can't be edited after it is submitted.
    submitButton.addEventListener('click', () => {
        clearError();
        const missing = [];
        if (!titleInput.value.trim()) missing.push('title');
        if (!summaryInput.value.trim()) missing.push('summary');
        if (!hasBodyText()) missing.push('content');
        if (!categorySelect.value) missing.push('category');
        if (missing.length) {
            showError(`אי אפשר להגיש עדיין. חסר: ${missing.map(name => fieldLabels[name]).join(', ')}`);
            return;
        }
        submitDialog.showModal();
    });

    submitDialogCancel.addEventListener('click', () => submitDialog.close());

    // Clicking the dark area around the box closes it too.
    submitDialog.addEventListener('click', event => {
        if (event.target === submitDialog) submitDialog.close();
    });

    submitDialogConfirm.addEventListener('click', async () => {
        submitDialogConfirm.disabled = true;
        submitButton.disabled = true;
        let submitted = false;
        try {
            if (!(await saveEverything())) {
                showError('לא הצלחנו לשמור את השינויים האחרונים. נסו שוב בעוד רגע.');
                return;
            }
            const response = await fetch(`${saveUrl}/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{}',
            });
            const data = await response.json();
            if (!response.ok) {
                const missing = (data.missingFields || []).map(name => fieldLabels[name] || name);
                showError(missing.length > 0 ? `אי אפשר להגיש עדיין. חסר: ${missing.join(', ')}` : data.error);
                return;
            }
            submitted = true;
            location.href = data.redirectUrl;
        } catch (err) {
            showError('אירעה שגיאה בהגשה. נסו שוב.');
        } finally {
            if (!submitted) { // after a successful submit the page is replaced
                submitButton.disabled = false;
                submitDialogConfirm.disabled = false;
                submitDialog.close(); // errors are shown on the page behind the dialog
            }
        }
    });
}

// ---------- do not lose work when the tab is closed or hidden ----------

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save({ keepalive: true });
});

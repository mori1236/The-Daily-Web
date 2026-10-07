const mongoose = require('mongoose');
const { ArticleTransitionError } = require('../errors');

const CATEGORIES = /** @type {const} */ (['politics', 'economy', 'tech', 'sports', 'culture', 'world']);
const STATES = /** @type {const} */ (['draft', 'pending', 'published', 'returned']);

/**
 * @typedef {(typeof CATEGORIES)[number]} ArticleCategory
 * @typedef {(typeof STATES)[number]} ArticleState
 * @typedef {import('./user.js').UserType['role']} UserRole
 */

// The fields a writer edits. They exist twice on every article:
// once as the working copy (top level) and once inside `published`.
const contentFields = {
    title: { type: String, trim: true, default: '' },
    summary: { type: String, trim: true, default: '' },
    content: { type: String, default: '' },
    category: { type: String, enum: CATEGORIES },
    imageUrl: { type: String, trim: true, default: '' },
};

/**
 * @typedef {keyof typeof contentFields} ContentFieldName
 * @typedef {Partial<Record<ContentFieldName, string>>} ContentChanges
 */

/** @type {ContentFieldName[]} */
const contentFieldNames = /** @type {ContentFieldName[]} */ (Object.keys(contentFields));
// Everything except the image must be filled in before an article can be submitted.
const requiredFieldNames = contentFieldNames.filter(name => name !== 'imageUrl');

// The last version approved by an editor. This is the only version readers see.
const publishedSchema = new mongoose.Schema({
    ...contentFields,
    publishedAt: { type: Date, required: true }, // first time it was published, never changes
    updatedAt: { type: Date, required: true }, // last time an editor approved a new version
}, { _id: false });

// כתבה שנכתבה על ידי writer ואושרה על ידי editor
const articleSchema = new mongoose.Schema({
    // Working copy: what the writer is editing right now. Never shown to readers.
    ...contentFields,
    writer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    state: { type: String, enum: STATES, default: 'draft' },

    submitedAt: { type: Date }, // when did the writer submit it
    editor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // last editor who published or returned it

    editorRejectNote: { type: String },
    rejectedAt: { type: Date }, // last time an editor returned it

    // null until the first approval. Readers only ever see this.
    published: { type: publishedSchema, default: undefined },
    // Every approval, oldest first. The views graph marks these points in time.
    publishEvents: [{
        _id: false,
        at: { type: Date, required: true },
        editor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    }],

    viewCount: { type: Number, default: 0 }, // total views, used for sorting by popularity
}, { timestamps: true });

// Public feed: newest published articles, optionally for one category.
articleSchema.index({ 'published.publishedAt': -1 });
articleSchema.index({ 'published.category': 1, 'published.publishedAt': -1 });
// A writer's own articles, filtered by state.
articleSchema.index({ writer: 1, state: 1, updatedAt: -1 });
// Articles an editor handled, filtered by state.
articleSchema.index({ editor: 1, state: 1, updatedAt: -1 });
// The editor's queue: all articles by state (mostly "pending", oldest submission first).
articleSchema.index({ state: 1, submitedAt: 1 });

/**
 * דרך הוחה להשתמש ב types של הסחמה
 * @typedef {import('mongoose').InferSchemaType<typeof articleSchema>} ArticleType
 * @typedef {import('mongoose').HydratedDocument<ArticleType>} ArticleDocument
 */

/**
 * @param {ArticleDocument} article
 * @param {import('./user.js').UserDocument} actuator
 * @param {UserRole} role
 * @param {string} action
 */
function requireRole(article, actuator, role, action) {
    if (actuator.role !== role) {
        throw new ArticleTransitionError(`Only "${role}" can ${action}`, {
            reason: 'forbidden', action, articleId: article._id,
            actorId: actuator._id, actorRole: actuator.role, requiredRole: role,
        });
    }
}

/** A writer may only touch their own articles. */
function requireOwner(article, actuator, action) {
    if (!article.writer.equals(actuator._id)) {
        throw new ArticleTransitionError(`A writer can only ${action} their own articles`, {
            reason: 'forbidden', action, articleId: article._id,
            actorId: actuator._id, ownerId: article.writer,
        });
    }
}

/**
 * @param {ArticleDocument} article
 * @param {readonly ArticleState[]} allowedStates - a subset of STATES
 * @param {string} action
 */
function requireState(article, allowedStates, action) {
    if (!allowedStates.includes(article.state)) {
        throw new ArticleTransitionError(
            `Cannot ${action} an article in state "${article.state}" (allowed: ${allowedStates.join(', ')})`,
            { reason: 'invalid-state', action, articleId: article._id, from: article.state, allowedStates });
    }
}

/**
 * An article must be complete before an editor sees it. Drafts may be incomplete (autosave).
 * @param {ArticleDocument} article
 * @param {string} action
 */
function requireComplete(article, action) {
    const missing = requiredFieldNames.filter(name => !article[name]);
    if (missing.length > 0) {
        throw new ArticleTransitionError(`Cannot ${action}: missing ${missing.join(', ')}`, {
            reason: 'invalid-input', action, articleId: article._id, missingFields: missing,
        });
    }
}

/**
 * Saves changes to the working copy (also used by autosave).
 * Writer: own article in draft / returned / published. Editing a published article
 * moves it back to "draft"; readers keep seeing `published` until an editor approves.
 * Editor: any article that is pending.
 * Unknown keys in `changes` are ignored.
 *
 * @todo Escape invalid chars and make sure no XSRF/CSRF attacks
 *
 * @this {ArticleDocument}
 * @param {import('./user.js').UserDocument} actuator
 * @param {ContentChanges} changes
 * @returns {Promise<void>}
 * @throws {ArticleTransitionError}
 */
articleSchema.methods.setArticleContent = async function (actuator, changes) {
    if (actuator.role === 'editor') {
        requireState(this, ['pending'], 'edit');
    } else {
        requireRole(this, actuator, 'writer', 'edit articles');
        requireOwner(this, actuator, 'edit');
        requireState(this, ['draft', 'returned', 'published'], 'edit');
    }

    for (const name of contentFieldNames) {
        if (changes[name] !== undefined) this[name] = changes[name];
    }
    if (this.state === 'published') this.state = 'draft';
    await this.save();
};

/**
 * draft -> pending
 * @this {ArticleDocument}
 * @param {import('./user.js').UserDocument} actuator
 * @returns {Promise<void>}
 * @throws {ArticleTransitionError}
 */
articleSchema.methods.SubmitDraftNow = async function (actuator) {
    requireRole(this, actuator, 'writer', 'submit articles');
    requireOwner(this, actuator, 'submit');
    requireState(this, ['draft'], 'submit');
    requireComplete(this, 'submit');
    this.state = 'pending';
    this.submitedAt = new Date();
    await this.save();
};

/**
 * returned -> pending (after the writer made the requested revisions)
 * @this {ArticleDocument}
 * @param {import('./user.js').UserDocument} actuator
 * @returns {Promise<void>}
 * @throws {ArticleTransitionError}
 */
articleSchema.methods.SubmitRejectFixNow = async function (actuator) {
    requireRole(this, actuator, 'writer', 'resubmit articles');
    requireOwner(this, actuator, 'resubmit');
    requireState(this, ['returned'], 'resubmit');
    requireComplete(this, 'resubmit');
    this.state = 'pending';
    this.submitedAt = new Date();
    await this.save();
};

/**
 * pending -> published. Copies the working copy into `published`.
 * @this {ArticleDocument}
 * @param {import('./user.js').UserDocument} actuator
 * @returns {Promise<void>}
 * @throws {ArticleTransitionError}
 */
articleSchema.methods.PublishNow = async function (actuator) {
    requireRole(this, actuator, 'editor', 'publish articles');
    requireState(this, ['pending'], 'publish');
    requireComplete(this, 'publish');

    const now = new Date();
    const published = { publishedAt: this.published ? this.published.publishedAt : now, updatedAt: now };
    for (const name of contentFieldNames) published[name] = this[name];

    this.published = published;
    this.publishEvents.push({ at: now, editor: actuator._id });
    this.state = 'published';
    this.editor = actuator._id;
    this.editorRejectNote = undefined;
    await this.save();
};

/**
 * pending -> returned, with a note explaining what to fix.
 * @this {ArticleDocument}
 * @param {import('./user.js').UserDocument} actuator
 * @param {string} rejectNote
 * @returns {Promise<void>}
 * @throws {ArticleTransitionError}
 */
articleSchema.methods.Reject = async function (actuator, rejectNote) {
    requireRole(this, actuator, 'editor', 'return articles');
    requireState(this, ['pending'], 'return');
    if (typeof rejectNote !== 'string' || rejectNote.trim() === '') {
        throw new ArticleTransitionError('A note is required when returning an article', {
            reason: 'invalid-input', action: 'return', articleId: this._id, missingFields: ['editorRejectNote'],
        });
    }
    this.state = 'returned';
    this.editor = actuator._id;
    this.editorRejectNote = rejectNote.trim();
    this.rejectedAt = new Date();
    await this.save();
};

const Article = mongoose.model('Article', articleSchema);
Article.CATEGORIES = CATEGORIES;
Article.STATES = STATES;
module.exports = Article;

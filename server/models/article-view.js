const mongoose = require('mongoose');

// One counter per article/minute/stripe, rather than one document per reader.
// The deterministic _id is also the unique upsert key, even before secondary indexes exist.
const articleViewSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    article: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', required: true },
    minute: { type: Date, required: true },
    stripe: { type: Number, required: true },
    count: { type: Number, default: 0, min: 0 },
}, { versionKey: false });

articleViewSchema.index({ article: 1, minute: 1 });

module.exports = mongoose.model('ArticleView', articleViewSchema);

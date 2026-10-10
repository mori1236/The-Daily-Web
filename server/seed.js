const User = require('./models/user');
const Article = require('./models/article');
const Comment = require('./models/comment');
const ArticleView = require('./models/article-view');
const { createHash } = require('node:crypto');
const { MINUTE, floorMinute } = require('./utils/analytics');

// Demo data for local development. Enabled with SEED_DEMO_DATA=true in .env.
// Every demo user has the password "12345678".
const demoPassword = '12345678';

const demoUsers = [
    { name: 'Dana Cohen', email: 'editor@dailyweb.test', role: 'editor' },
    { name: 'Yossi Levi', email: 'editor2@dailyweb.test', role: 'editor' },
    { name: 'Noa Mizrahi', email: 'writer@dailyweb.test', role: 'writer' },
    { name: 'Avi Peretz', email: 'writer2@dailyweb.test', role: 'writer' },
    { name: 'Maya Friedman', email: 'writer3@dailyweb.test', role: 'writer' },
];

// נעזרתי פה בקלוד לייצר את הדוגמה

const articleCount = 500;
const dayMs = 24 * 60 * 60 * 1000;

// A title is built as "<subject>: <development> <place>", for example "חוקרים: ממצאים חדשים בגליל".
// The development is a noun phrase, so every combination reads well in Hebrew.
const subjects = ['מועצת העיר', 'סטארט־אפ מקומי', 'נבחרת ישראל', 'חוקרים', 'הבנק המרכזי',
    'מוזיאון חדש', 'חקלאים', 'משרד התחבורה', 'סופר ידוע', 'סטודנטים'];
const developments = ['תוכנית חדשה', 'עיכובים בלתי צפויים', 'פרס יוקרתי', 'ממצאים חדשים',
    'פתיחה לקהל', 'תגובה לביקורת', 'שיא חדש', 'מיזם חדש'];
const places = ['בתל אביב', 'בחיפה', 'בירושלים', 'ברחבי הארץ', 'בנגב', 'בגליל'];

// A small deterministic pseudo-random number generator, so every seed run
// produces the same articles (handy when debugging and at the defense).
let randomState = 12345;
function random() {
    randomState = (randomState * 1664525 + 1013904223) % 4294967296;
    return randomState / 4294967296;
}
function pick(list) {
    return list[Math.floor(random() * list.length)];
}

function makeContent(index, version) {
    const title = `${pick(subjects)}: ${pick(developments)} ${pick(places)}`;
    const paragraph = `${title}. זוהי כתבת דוגמה מספר ${index + 1}, גרסה ${version}. ` +
        'היא קיימת רק כדי למלא את האתר בתוכן שנראה אמיתי להדגמה.';
    return {
        title,
        summary: `${title}. קראו את הכתבה המלאה.`,
        content: [paragraph, paragraph, paragraph].join('\n\n'),
        category: pick(Article.CATEGORIES),
        imageUrl: `https://picsum.photos/seed/daily-web-${index}/800/450`,
    };
}

// Builds one demo article. Roughly: 60% published, 15% draft, 15% pending, 10% returned.
// Every 10th published article was updated several times after publishing, and every 20th
// published article also has a newer version waiting for the editor (the "update in progress" case).
function makeArticle(index, writers, editors, now) {
    const bucket = index % 100;
    const writer = writers[index % writers.length];
    const editor = editors[index % editors.length];
    const article = { writer: writer._id, ...makeContent(index, 1) };

    if (bucket < 60) {
        // Published, with 1 to 4 approvals spread over the last 60 days.
        const updates = index % 10 === 0 ? 1 + Math.floor(random() * 3) : 0;
        const firstPublished = now - (1 + random() * 59) * dayMs;
        const events = [firstPublished];
        for (let i = 0; i < updates; i++) {
            const last = events[events.length - 1];
            events.push(last + random() * (now - last));
        }

        const live = makeContent(index, updates + 1);
        const lastApproved = new Date(events[events.length - 1]);
        Object.assign(article, live, {
            state: 'published',
            editor: editor._id,
            submitedAt: new Date(firstPublished - dayMs / 2),
            published: { ...live, publishedAt: new Date(firstPublished), updatedAt: lastApproved },
            publishEvents: events.map(at => ({ at: new Date(at), editor: editor._id })),
            viewCount: Math.floor(random() * 5000),
            createdAt: new Date(firstPublished - dayMs),
            updatedAt: lastApproved,
        });

        if (index % 20 === 0) {
            // Update in progress: the working copy is newer than the published copy.
            const edited = makeContent(index, updates + 2);
            const stage = Math.floor(random() * 3);
            Object.assign(article, edited, {
                state: ['draft', 'pending', 'returned'][stage],
                updatedAt: new Date(now - random() * dayMs),
            });
            if (stage > 0) article.submitedAt = new Date(now - random() * dayMs);
            if (stage === 2) {
                article.editorRejectNote = 'כדאי לקצר את התקציר ולבדוק שוב את העובדות.';
                article.rejectedAt = new Date(now - random() * dayMs);
            }
        }
    } else {
        const created = new Date(now - random() * 10 * dayMs);
        article.createdAt = created;
        article.updatedAt = created;
        if (bucket < 75) {
            article.state = 'draft';
            // Drafts are often unfinished (autosave), so blank some fields.
            if (index % 3 === 0) { article.summary = ''; article.content = ''; }
        } else if (bucket < 90) {
            article.state = 'pending';
            article.submitedAt = created;
        } else {
            article.state = 'returned';
            article.submitedAt = created;
            article.editor = editor._id;
            article.rejectedAt = new Date(created.getTime() + dayMs / 4);
            article.editorRejectNote = 'הכתבה צריכה פתיח חזק יותר ומקור למספרים.';
        }
    }
    return article;
}

async function seedUsers() {
    if (await User.countDocuments() > 0) return;

    for (const data of demoUsers) {
        const user = new User(data);
        await user.setPassword(demoPassword);
        await user.save();
    }
    console.log(`Seeded ${demoUsers.length} demo users (password: ${demoPassword})`);
}

async function seedArticles() {
    if (await Article.countDocuments() > 0) return;

    const writers = await User.find({ role: 'writer' }).sort({ email: 1 });
    const editors = await User.find({ role: 'editor' }).sort({ email: 1 });
    if (writers.length === 0 || editors.length === 0) return;

    const now = Date.now();
    const articles = [];
    for (let i = 0; i < articleCount; i++) {
        articles.push(makeArticle(i, writers, editors, now));
    }
    await Article.insertMany(articles);
    console.log(`Seeded ${articles.length} demo articles`);
}

async function seedComments() {
    if (await Comment.countDocuments() > 0) return;

    const publishedArticles = await Article.find({ state: 'published' }).limit(30);
    if (publishedArticles.length === 0) return;

    const now = Date.now();
    const demoComments = [
        {
            authorName: 'אורי כהן',
            content: 'חשוב שהתקציב יגיע גם לעסקים הקטנים. הם אלה שמחזיקים את היישובים בחיים.',
            minutesAgo: 12,
        },
        {
            authorName: 'מאיה לב',
            content: 'מקווה שבקרוב נראה לוחות זמנים שקופים לציבור ולא רק כותרות. זה המבחן האמיתי.',
            minutesAgo: 28,
        },
        {
            authorName: 'יוסי כהן',
            content: 'כתבה מצוינת ומעמיקה! מעלה נקודות חשובות שאי אפשר להתעלם מהן.',
            minutesAgo: 65,
        },
        {
            authorName: 'רוני אלון',
            content: 'מסכים לגמרי עם הנאמר. יש צורך בשינוי מיידי של סדרי העדיפויות.',
            minutesAgo: 180,
        },
        {
            authorName: 'דניאל שרון',
            content: 'נושא קריטי שנוגע לכולנו. מקווה שהגורמים הרלוונטיים יקראו ויישמו.',
            minutesAgo: 320,
        },
    ];

    const commentsToInsert = [];
    for (let i = 0; i < publishedArticles.length; i++) {
        const article = publishedArticles[i];
        if (i === 0) {
            commentsToInsert.push({
                article: article._id,
                authorName: demoComments[0].authorName,
                content: demoComments[0].content,
                createdAt: new Date(now - demoComments[0].minutesAgo * 60 * 1000),
                updatedAt: new Date(now - demoComments[0].minutesAgo * 60 * 1000),
            });
            commentsToInsert.push({
                article: article._id,
                authorName: demoComments[1].authorName,
                content: demoComments[1].content,
                createdAt: new Date(now - demoComments[1].minutesAgo * 60 * 1000),
                updatedAt: new Date(now - demoComments[1].minutesAgo * 60 * 1000),
            });
        } else if (i % 2 === 0) {
            const c = demoComments[i % demoComments.length];
            commentsToInsert.push({
                article: article._id,
                authorName: c.authorName,
                content: c.content,
                createdAt: new Date(now - c.minutesAgo * 60 * 1000),
                updatedAt: new Date(now - c.minutesAgo * 60 * 1000),
            });
        }
    }

    if (commentsToInsert.length > 0) {
        await Comment.insertMany(commentsToInsert);
        console.log(`Seeded ${commentsToInsert.length} demo comments`);
    }
}

const analyticsScenarios = [
    { key: 'growth', title: '[דמו] השקת הרכבת הקלה: עלייה בצפיות אחרי עדכון', category: 'tech', factors: [1, 1.3, 1.8, 2.7] },
    { key: 'decline', title: '[דמו] שוק ההון: ירידה בצפיות אחרי עדכון', category: 'economy', factors: [1, 1.2, 0.8, 0.4] },
    { key: 'steady', title: '[דמו] משחק העונה: קצב צפיות יציב', category: 'sports', factors: [1, 1.03, 0.98, 1.02] },
    { key: 'mixed', title: '[דמו] פסטיבל התרבות: השפעה משתנה של עדכונים', category: 'culture', factors: [1, 1.8, 0.9, 1.6] },
];

// Pure deterministic fixture generator. No event-level reader data or changes to
// the global article seed RNG. `until` is fixed on creation, so reruns cannot move
// approvals or add the same traffic twice.
function makeAnalyticsViews(article, scenario) {
    const start = floorMinute(article.viewTrackingStartedAt);
    const end = floorMinute(article.analyticsDemo.until);
    const events = (article.publishEvents || []).map(event => Number(new Date(event.at))).sort((a, b) => a - b);
    const rows = [];
    for (let minute = start, index = 0; minute < end; minute += MINUTE, index++) {
        let version = 0;
        events.forEach((event, i) => { if (event <= minute) version = i; });
        const wave = scenario.key === 'steady'
            ? 16 + 0.4 * Math.sin(index / 75) + 0.3 * Math.cos(index / 31)
            : 16 + 3 * Math.sin(index / 75) + 2 * Math.cos(index / 31);
        const jitter = ((index * 17 + scenario.key.length * 13) % 11 - 5) * 0.25;
        const count = Math.max(1, Math.round(wave * scenario.factors[Math.min(version, scenario.factors.length - 1)] + jitter));
        const stripe = scenario.stripe ?? 0;
        rows.push({ _id: `${article._id}:${minute}:${stripe}`, article: article._id,
            minute: new Date(minute), stripe, count });
    }
    return rows;
}

async function persistAnalyticsViews(article, scenario) {
    if (article.analyticsDemo.seededAt) return false;
    const views = makeAnalyticsViews(article, scenario);
    // Insert-only upserts make partial runs recoverable and concurrent seed runs safe.
    for (let offset = 0; offset < views.length; offset += 500) {
        await ArticleView.bulkWrite(views.slice(offset, offset + 500).map(row => ({
            updateOne: { filter: { _id: row._id }, update: { $setOnInsert: row }, upsert: true },
        })), { ordered: true });
    }
    await Article.updateOne({ _id: article._id, 'analyticsDemo.seededAt': { $exists: false } }, {
        $inc: { viewCount: views.reduce((sum, row) => sum + row.count, 0) },
        $set: { 'analyticsDemo.seededAt': new Date() },
    }, { timestamps: false });
    return true;
}

// The original seed's live content/image identifies its articles even if the
// writer changed the working copy. Non-seed articles are left alone.
async function seedExistingArticleAnalytics() {
    const articles = await Article.find({
        published: { $ne: null },
        $or: [
            { 'published.content': /זוהי כתבת דוגמה מספר \d+/ },
            { 'published.imageUrl': /^https:\/\/picsum\.photos\/seed\/daily-web-\d+\/800\/450$/ },
        ],
    }).select('published.publishedAt publishEvents viewTrackingStartedAt analyticsDemo').lean();
    let seeded = 0;
    for (const original of articles) {
        if (original.analyticsDemo?.seededAt) continue;
        const key = `impact-legacy-v1-${original._id}`;
        if (original.analyticsDemo && original.analyticsDemo.key !== key) continue;
        const until = floorMinute(Date.now());
        // Fill the default 24-hour graph without inventing new publication events
        // or generating tens of millions of rows for the seed's 60-day history.
        const published = Number(new Date(original.published.publishedAt));
        const start = Math.max(Math.ceil(published / MINUTE) * MINUTE, until - dayMs);
        if (!original.analyticsDemo) {
            await Article.updateOne({ _id: original._id, analyticsDemo: { $exists: false } }, {
                $set: { analyticsDemo: { key, until: new Date(until) } },
                $min: { viewTrackingStartedAt: new Date(start) },
            }, { timestamps: false });
        }
        const article = await Article.findById(original._id)
            .select('published.publishedAt publishEvents viewTrackingStartedAt analyticsDemo').lean();
        // The fixture interval remains fixed if a seed run is interrupted. Real
        // counters use stripes 0–15; stripe 16 keeps simulated traffic separate.
        const fixtureStart = Math.max(Math.ceil(published / MINUTE) * MINUTE,
            Number(article.analyticsDemo.until) - dayMs);
        const fixture = { ...article, viewTrackingStartedAt: new Date(fixtureStart) };
        const scenarioIndex = parseInt(String(article._id).slice(-6), 16) % analyticsScenarios.length;
        if (await persistAnalyticsViews(fixture, { ...analyticsScenarios[scenarioIndex], stripe: 16 })) seeded++;
    }
    if (seeded) console.log(`Seeded view history for ${seeded} existing demo articles`);
}

// Add timelines both to the original seed articles and the four comparison
// scenarios. Existing content, publication events and reader counters stay intact.
async function seedAnalytics() {
    await seedExistingArticleAnalytics();
    const [writers, editors] = await Promise.all([
        User.find({ role: 'writer' }).sort({ email: 1 }),
        User.find({ role: 'editor' }).sort({ email: 1 }),
    ]);
    if (!writers.length || !editors.length) return;
    for (let index = 0; index < analyticsScenarios.length; index++) {
        const scenario = analyticsScenarios[index];
        const key = `impact-analytics-v1-${scenario.key}`;
        const id = createHash('sha256').update(key).digest('hex').slice(0, 24);
        let article = await Article.findById(id);
        if (!article) {
            const until = floorMinute(Date.now());
            const firstPublished = new Date(until - 20 * 60 * MINUTE);
            const approvals = [firstPublished, ...[18, 8, 2].map(hours => new Date(until - hours * 60 * MINUTE))];
            const content = {
                title: scenario.title, category: scenario.category,
                summary: 'כתבת הדגמה עם צפיות מסומלצות וסימוני פרסום עדכונים לצורך בדיקת ניתוח השפעה.',
                content: '<p>זוהי כתבת דמו. נתוני הצפייה שלה מסומלצים ונועדו להדגים השוואה לפני ואחרי פרסום עדכונים.</p>',
                imageUrl: '/img/login-newsroom.jpg',
            };
            try {
                article = await Article.create({
                    _id: id, ...content, writer: writers[index % writers.length]._id,
                    editor: editors[index % editors.length]._id, state: 'published',
                    published: { ...content, publishedAt: firstPublished, updatedAt: approvals[3] },
                    publishEvents: approvals.map(at => ({ at, editor: editors[index % editors.length]._id })),
                    viewTrackingStartedAt: firstPublished,
                    analyticsDemo: { key, until: new Date(until) },
                    createdAt: firstPublished, updatedAt: approvals[3],
                });
            } catch (error) {
                if (error.code !== 11000) throw error;
                article = await Article.findById(id);
            }
        }
        if (article.analyticsDemo?.key !== key) throw new Error('Analytics seed ID belongs to a different article');
        if (await persistAnalyticsViews(article, scenario)) console.log(`Seeded analytics scenario ${scenario.key}`);
    }
}

// Ordinary collections are seeded only when empty. Analytics fixtures use their
// own stable keys, so they can be added without deleting any existing collection.
async function seedDemoData() {
    await seedUsers();
    await seedArticles();
    await seedComments();
    await seedAnalytics();
}

module.exports = { seedDemoData, seedAnalytics, makeAnalyticsViews, analyticsScenarios };

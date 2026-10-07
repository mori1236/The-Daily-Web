const User = require('./models/user');
const Article = require('./models/article');

// Demo data for local development. Enabled with SEED_DEMO_DATA=true in .env.
// Every demo user has the password "123456".
const demoPassword = '123456';

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

const subjects = ['The city council', 'A local startup', 'The national team', 'Researchers', 'The central bank',
    'A new museum', 'Farmers', 'The transport ministry', 'A famous author', 'Students'];
const actions = ['announces a major plan', 'faces unexpected delays', 'wins an important award', 'reveals new findings',
    'opens to the public', 'responds to criticism', 'breaks a long-standing record', 'launches a new program'];
const places = ['in Tel Aviv', 'in Haifa', 'in Jerusalem', 'across the country', 'in the Negev', 'in the Galilee'];

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
    const title = `${pick(subjects)} ${pick(actions)} ${pick(places)}`;
    const paragraph = `${title}. This is demo article number ${index + 1}, version ${version}. ` +
        'It exists only to fill the site with realistic looking content for the demo.';
    return {
        title,
        summary: `${title}. Read the full story.`,
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
                article.editorRejectNote = 'Please shorten the summary and double check the facts.';
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
            article.editorRejectNote = 'The article needs a stronger opening and a source for the numbers.';
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

// Adds each kind of demo data only when its collection is empty,
// so real data is never overwritten and restarts are safe.
async function seedDemoData() {
    await seedUsers();
    await seedArticles();
}

module.exports = { seedDemoData };

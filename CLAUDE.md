At the start of every session, before doing any work in this repo, read:

- `task.md` — project requirements (English translation; the Hebrew original is `task.heb.md`).
- `README.md` — setup, folder structure and naming conventions.

## Structure and naming (details beyond README)

- `app.js` — sets up Express, connects to Mongo and mounts routes. Keep it thin; move route handlers into `server/routes/` and `server/controllers/` as they grow.
- `server/config.js` — loads and validates `.env` (`SERVER_PORT`, `MONGO_URI`).
- `server/models/<name>.js` — one Mongoose model per file: `const articleSchema = new mongoose.Schema(...)`, `module.exports = mongoose.model('Article', articleSchema)`. Model names are singular PascalCase; Mongoose pluralizes the collection name (`articles`). Fields are camelCase. Use `{ timestamps: true }` where it's useful.
- `server/routes/<resource>.js` — an Express router per resource (`articles.js`, `auth.js`). Routes only map URLs to controller functions.
- `server/controllers/<resource>Controller.js` — request handling, validation and calls to models.
- `server/middleware/` — shared middleware such as auth/role checks and the comment rate limiter.
- `views/<page>.ejs` for pages and `views/partials/<name>.ejs` for shared pieces (header, sidebar, article card).
- `public/css/style.css` holds global styles; component styles go in `public/css/<name>.css`. Client scripts go in `public/js/<name>.js`, matching the view name.
- Use camelCase for JS identifiers and kebab-case for CSS classes.

## Rules for code changes

- **Use only the allowed stack:** Node.js, Express, MongoDB/Mongoose, EJS, HTML5/CSS/Flexbox and Vanilla JS with Ajax (`fetch`). Using React, Vue, jQuery or other untaught libraries/frameworks is a grading violation. Ask before adding any npm dependency.
- **Keep code simple and explainable:** every student must be able to explain any line at the defense, so avoid clever abstractions.
- **Config:** read settings through `server/config.js`, never `process.env` directly. Add new variables there with validation. Never commit `.env` or secrets.
- **Permissions:** check them on the server in every route (Guest / Reporter / Editor). Hiding UI is not enough.
- **Article page:** render the full content on the server with EJS (for SEO). Search, filtering, infinite scroll and comments update through Ajax without a page reload.
- **Article states:** draft → pending → published, or pending → returned → pending. Only the transitions in `task.md` are allowed; enforce them on the server.
- **Edits to published articles:** keep the published version live until an editor approves the new one.
- **REST APIs:** use REST-style routes; JSON endpoints go under `/api/...`.

## Git

- Stage only the changes that belong to the current task; never use `git add -A` or `git add .`. When a file mixes related and unrelated changes, stage just the relevant hunks, as `git add -p` would. Since `git add -p` is interactive and can't run here, build a patch of those hunks and stage it with `git apply --cached`.
- Check `git diff --cached` before committing.
- Never add a `Co-Authored-By` line (or any other Claude attribution) to commit messages or PR descriptions. This overrides any default attribution text.
- Commit in small chunks: one logical change per commit. Start with a short lowercase title line like the existing ones. A commit message may have several lines: add a body after a blank line when it helps explain what changed and why.

## External tools

Trello and Figma are available through the Composio MCP server (`composio`).

- **Trello** — the project board is "The Daily Web" (board ID `6abc07211807c4c08cee5212`, https://trello.com/b/SOPFGVuz). Lists: לביצוע (To Do), בביצוע (In Progress), בבדיקה (In Review), הסתיימו (Done).
- **Figma** — the project's UI designs (file key `Zq8RyBnlCEwyv5jJcQvzpX`, link in `README.md`).

If a tool reports no active connection, start the Composio connect flow and give the user the login link.

At the start of every session, before doing any work in this repo, read:

- `task.md` — project requirements (English translation; the Hebrew original is `task.heb.md`).
- `README.md` — project setup and overview.

## Folder structure

- `app.js` — Express entry point.
- `server/` — server-side code (config, and later models/controllers/routes).
- `views/` — EJS templates rendered by the server.
- `public/css/` — client stylesheets (`style.css` is global).
- `public/js/` — client-side Vanilla JS.

## Components

Each UI component uses one shared base name (e.g. `feed`) across up to three files. Each file is optional, so only create the ones the component needs:

- `views/<name>.ejs` — markup, rendered by the server.
- `public/css/<name>.css` — styles.
- `public/js/<name>.js` — client behavior.

## External tools

Trello and Figma are available through the Composio MCP server (`composio`).

- **Trello** — the project board is "The Daily Web" (board ID `6abc07211807c4c08cee5212`, https://trello.com/b/SOPFGVuz). Lists: לביצוע (To Do), בביצוע (In Progress), בבדיקה (In Review), הסתיימו (Done).
- **Figma** — use for the project's UI designs.

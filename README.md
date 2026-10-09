# The Daily Web

## Setup

### Install

Node js (see version at [.nvmrc](.nvmrc))
[MongoDB Community](https://www.mongodb.com/try/download/community-kubernetes-operator)  

**Recommended too**  

VScode and the recommended extentions at [.vscode/extensions.json](.vscode/extensions.json)  
And utilize our configured tasks and debugger configs  

### Setup Mongo

Only in addministrator make sure the service is running

```cmd
net start MongoDB
```

#### Demo data

To start with demo data, add this to `.env`:

```env
SEED_DEMO_DATA=true
```

On startup the server adds the demo users below, but only if the database has no users yet. To get a fresh copy, delete the `users` collection and restart the server.

| Role   | Email                   | Password |
|--------|-------------------------|----------|
| editor | `editor@dailyweb.test`  | `123456` |
| editor | `editor2@dailyweb.test` | `123456` |
| writer | `writer@dailyweb.test`  | `123456` |
| writer | `writer2@dailyweb.test` | `123456` |
| writer | `writer3@dailyweb.test` | `123456` |

The demo data lives in [server/seed.js](server/seed.js).

## Tools

Trello board - https://trello.com/b/SOPFGVuz/the-daily-web  
Figma - https://www.figma.com/design/Zq8RyBnlCEwyv5jJcQvzpX/%25D7%2590%25D7%25AA%25D7%25A8-%25D7%2597%25D7%2593%25D7%25A9%25D7%2595%25D7%25AA  


## Development

### Claude Code + Trello/Figma (MCP)

The repo ships a [.mcp.json](.mcp.json) that connects Claude Code to [Composio](https://composio.dev), which gives Claude access to Trello and Figma.

1. Open Claude Code in the project and approve the `composio` server when asked.
2. Run `/mcp`, choose `composio` and log in.
3. Ask Claude to do something in Trello or Figma. The first time, it sends you a link to connect each app; open it and log in.

Your connections are private to you. You need access to the Trello board and the Figma file above.

## 📁 Folder structure

### Feed read-status filtering

The browser keeps read article IDs in `localStorage` under `dailyweb_read_articles`.
It requests the feed with `POST /api/articles?page=1&limit=20` and a JSON body
`{ "readStatus": "unread", "readIds": ["<article ObjectId>"] }`.
Supported statuses are `all`, `read`, and `unread`. MongoDB applies this filter
before pagination and counting, together with category, search, and sort filters.
Read history stays in the browser and is sent for each filtered request; it is not
saved to a user account. The existing GET endpoint remains available for feed clients.

MVC layout:

- `app.js` — entry point.
- `server/models/` — Mongoose schemas and models. One file per model, singular lowercase (`article.js`); schema `articleSchema`, model `Article` (singular PascalCase).
- `server/controllers/`, `server/routes/` — request logic and routing.
- `views/` — EJS templates.
- `public/css/`, `public/js/` — client CSS and Vanilla JS.

A UI component shares one name across `views/<name>.ejs`, `public/css/<name>.css` and `public/js/<name>.js`. Each file is optional.


### Homepage weather

The Tel Aviv weather card uses `/api/weather`, backed by the
[Open-Meteo Forecast API](https://open-meteo.com/en/docs). No API key is required.
It shows current temperature, feels-like temperature, humidity, wind in km/h,
and the next three four-hour forecast slots in the `Asia/Jerusalem` timezone.
The server caches results for fifteen minutes and the browser refreshes every fifteen
minutes. Loading and provider failures show placeholders rather than demo data.
The server needs outbound HTTPS access to `api.open-meteo.com`.


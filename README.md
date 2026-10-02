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

MVC layout:

- `app.js` — entry point.
- `server/models/` — Mongoose schemas and models. One file per model, singular lowercase (`article.js`); schema `articleSchema`, model `Article` (singular PascalCase).
- `server/controllers/`, `server/routes/` — request logic and routing.
- `views/` — EJS templates.
- `public/css/`, `public/js/` — client CSS and Vanilla JS.

A UI component shares one name across `views/<name>.ejs`, `public/css/<name>.css` and `public/js/<name>.js`. Each file is optional.


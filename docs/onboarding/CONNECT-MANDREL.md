<!--
  ONBOARDING TEMPLATE — "Connect Mandrel"
  Hand this to a founding tester at provisioning. Fill the {{PLACEHOLDERS}} with their
  instance values, then send the filled copy. Keep the original template clean.

  Placeholders to fill per user:
    {{MCP_URL}}        e.g. https://acme.mandrel.ridgetopai.net/mcp   (their MCP endpoint, ends in /mcp)
    {{DASHBOARD_URL}}  e.g. https://acme.mandrel.ridgetopai.net       (their web dashboard, the base URL)
    {{TOKEN}}          their bearer token (secret)
    {{ADMIN_USER}}     dashboard login username (default: admin)
    {{ADMIN_PASSWORD}} dashboard login password (rotated per instance — secret)
-->

# Connect Mandrel — Your Setup

Welcome — you're one of the first. **Mandrel is long-term memory for AI-assisted coding:** your agent saves the important stuff — decisions, bug fixes, context — in a searchable record, so it stops starting from zero every session. You can also browse and search all of it yourself in a web dashboard.

You have your **own private, hosted instance**. Nothing to install, no server to run — just point your coding agent at it. Two minutes, below.

> **We gave you:**
> - **MCP endpoint:** `{{MCP_URL}}`
> - **Access token:** `{{TOKEN}}`  *(treat this like a password — it's the key to your instance)*
> - **Dashboard:** `{{DASHBOARD_URL}}`  (login: `{{ADMIN_USER}}` / `{{ADMIN_PASSWORD}}`)

---

## 1. Connect your coding agent

### Claude Code — one command
```bash
claude mcp add --transport http mandrel {{MCP_URL}} --header "Authorization: Bearer {{TOKEN}}"
```
Then check it:
```bash
claude mcp list
```
You should see `mandrel ... ✓ Connected`. That's it — Mandrel's tools are now in your Claude Code.
*(Tip: add `--scope user` to the command to make Mandrel available in every project, not just this one.)*

### Amp — a small config block
Add this to your Amp settings (`amp.mcpServers`):
```json
"mandrel": {
  "url": "{{MCP_URL}}",
  "headers": { "Authorization": "Bearer {{TOKEN}}" }
}
```
Save and reload Amp. Mandrel's tools will load alongside your others.

---

## 2. Or — let your agent set itself up

Don't want to touch a terminal? Paste this to Claude Code or Amp and let it do the work:

> Connect me to my Mandrel instance (it's my AI coding memory, over MCP).
> - MCP URL: `{{MCP_URL}}`
> - Auth header: `Authorization: Bearer {{TOKEN}}`
>
> If I'm in **Claude Code**, run:
> `claude mcp add --transport http mandrel {{MCP_URL}} --header "Authorization: Bearer {{TOKEN}}"`
> then `claude mcp list` and tell me if it shows Connected.
> If I'm in **Amp**, add a `mandrel` server to my `amp.mcpServers` settings with that url and Authorization header, then tell me to reload.

Your agent reads the access, runs the right setup, and confirms it's connected.

---

## 3. First moves once connected

Ask your agent to:
- **`mandrel_help`** — see everything Mandrel can do.
- **Create/switch a project** (`project_create`, `project_switch`) — your memory is organized per project.
- Then just work. As you go, your agent saves decisions (with the *why*), bug fixes (with the *fix*), context, and plans — tagged and searchable.

The payoff shows up next session: instead of re-explaining your project, your agent runs **`context_get_recent`** or **`context_search`** and it's caught up in seconds.

## 4. See your memory (the dashboard)

Open **`{{DASHBOARD_URL}}`** and log in (`{{ADMIN_USER}}` / `{{ADMIN_PASSWORD}}`). You can browse and search everything your agent has remembered — every decision, fix, context, and task, across all your projects. It's *your* project memory, readable by you, not trapped inside a chat.

---

## Troubleshooting

- **Not connected / "failed to fetch":** double-check the URL ends in `/mcp` and the token is pasted exactly (no extra spaces or line breaks).
- **`401 Unauthorized`:** the token is wrong or missing the `Bearer ` prefix.
- **Need a new token, or anything weird:** just message us — you're a founding tester, you get the white-glove treatment. Your feedback is the whole point.

---

*You're a founding tester — free forever, and you help shape where this goes. Thank you. 🦾*

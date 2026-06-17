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

## 2. Or — let your agent set it up (keeps your token out of the chat)

Don't want to touch a terminal? Let your agent do it — but **don't paste your token into the
chat.** Your token is a password, and chat messages can be logged. Instead, hand your agent
the *file* and let it read the token from disk:

1. **Save this file** into your project (e.g. as `mandrel-CONNECT.md`).
2. Tell Claude Code or Amp:

> Read `mandrel-CONNECT.md` in my project and connect me to my Mandrel instance over MCP,
> using the MCP URL and token from that file (don't print the token back to me).
> - If I'm in **Claude Code**, run the `claude mcp add` command shown in the file, then run
>   `claude mcp list` and tell me if it shows Connected.
> - If I'm in **Amp**, add a `mandrel` server to my `amp.mcpServers` settings using the URL
>   and `Authorization: Bearer` header from the file, then tell me to reload.

Your agent reads the token straight from the file and runs the setup — you never paste it
into the chat. (When you're done, you can delete the file or keep it somewhere private.)

---

## 3. First moves once connected

Ask your agent to:
- **`mandrel_help`** — see everything Mandrel can do.
- **Create/switch a project** (`project_create`, `project_switch`) — your memory is organized per project.
- Then just work. As you go, your agent saves decisions (with the *why*), bug fixes (with the *fix*), context, and plans — tagged and searchable.

The payoff shows up next session: instead of re-explaining your project, your agent runs **`context_get_recent`** or **`context_search`** and it's caught up in seconds.

## 3.5 Make your agent use it well (recommended)

Mandrel is only as good as the habits your agent has. Paste this into your **`AGENTS.md`** (Amp) or **`CLAUDE.md`** (Claude Code) — it's tight on purpose, just the habits that matter:

```
## Mandrel — your persistent memory
You have Mandrel tools connected. Use them on your own initiative, without being asked.
- Start each session by RECALLING: run `context_get_recent`, and `context_search "<topic>"`
  for anything relevant — continue, don't start cold. Confirm the right project with
  `project_current` (use `project_switch` if needed) so memory lands in the right place.
- Save the SIGNAL as it happens (don't wait to be told):
  • a decision → `decision_record` (always include the WHY + alternatives)
  • a bug fix  → `context_store(type:"error")` with the symptom AND the fix
  • finished work / a milestone → `context_store(type:"completion"|"milestone")`
  • end of session → `context_store(type:"handoff")` so the next session picks up clean
- SEARCH before re-solving: check `context_search` before re-deriving something.
- Track work with `task_create` / `task_update`.
Store signal, not noise. Run `mandrel_help` once to see the full toolset.
```

That's the whole thing — adjust to taste, but resist adding noise. The agents that get the most out of Mandrel treat it like a teammate's memory: recall first, save the *why*, search before redoing.

---

## 4. See your memory (the dashboard)

Open **`{{DASHBOARD_URL}}`** and log in (`{{ADMIN_USER}}` / `{{ADMIN_PASSWORD}}`). You can browse and search everything your agent has remembered — every decision, fix, context, and task, across all your projects. It's *your* project memory, readable by you, not trapped inside a chat.

---

## Security & privacy (short version)

You get your **own private instance** — own container, own database, own token. Not multi-tenant; your data is physically isolated, not mixed with anyone else's. Your agent connects with a token over HTTPS (fail-closed, no token = no access); the dashboard has its own login. **Embeddings run locally** on your instance, so your code isn't sent to a third-party AI to be indexed — and as the operator we see **stats, not content** (counts and health, never your data). It's early — no SSO/MFA/compliance yet, straight up — but your data is **private and isolated today**. Full details in `AUTH.md`, or just ask.

---

## Troubleshooting

- **Not connected / "failed to fetch":** double-check the URL ends in `/mcp` and the token is pasted exactly (no extra spaces or line breaks).
- **`401 Unauthorized`:** the token is wrong or missing the `Bearer ` prefix.
- **Need a new token, or anything weird:** just message us — you're a founding tester, you get the white-glove treatment. Your feedback is the whole point.

---

*You're a founding tester — free forever, and you help shape where this goes. Thank you. 🦾*

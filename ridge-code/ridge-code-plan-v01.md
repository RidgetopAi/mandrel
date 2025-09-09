Awesome—love the clarity. Here’s a battle-tested plan that gets you a lifetime dev CLI without overcomplicating it, while keeping it extensible for your AIDIS memory + multi-provider vision.

# Plan v1 (practical, modular, shippable)

## 0) Core choices (opinionated defaults)

* **Language:** Python (you’re strongest here).
* **CLI framework:** **Typer** (click under the hood, great DX).
* **Interactive shell & keybindings:** **prompt\_toolkit** (slash-commands, history, multiline, completion).
* **Rendering:** **Rich** (Markdown, code blocks, tables, live stats).
* **Background tasks & streaming:** **AnyIO/asyncio** (simple concurrency).
* **Config:** `~/.ridge/config.toml` + env (`.env` via python-dotenv). Profiles per environment.
* **Storage:**

  * **Session & telemetry:** local **SQLite** (fast, embed).
  * **Project memory:** your **AIDIS Postgres/pgvector MCP** (via the MCP client adapter below).

## 1) Project structure

```
ridge_cli/
  cli.py                    # entry; starts REPL (/ commands) and one-shot mode
  core/
    bus.py                  # MessageBus: routes user→llm, tools, memory
    models.py               # pydantic models: Message, ToolCall, Stats, Profile...
    render.py               # Rich renderers: markdown, tables, status bars
    telemetry.py            # token/time/tool-call accounting + SQLite sink
    config.py               # load/validate profiles, secrets, per-provider options
    registry.py             # plugin registry (providers, tools, renderers)
  providers/                # Provider adapters (uniform interface)
    openai_.py
    anthropic_.py
    google_.py
    mistral_.py
    groq_.py
    ollama_.py             # local
    vllm_.py               # OpenAI-compatible server
    llamacpp_.py           # llama.cpp server
    base.py                # Provider interface: .chat(), .stream(), .count_tokens()
  tools/                    # Tool adapters (uniform tool protocol)
    shell.py               # guarded /bash tool
    fs.py                  # read/write with policies
    git.py                 # lightweight git ops (status/diff/log)
    mcp_bridge.py          # calls your Memory MCP endpoints
  memory/
    mcp_client.py          # MCP client; schemas for context/decisions/tasks
  repl/
    commands.py            # /model, /provider, /send, /attach, /bash, /tool ...
    completer.py           # prompt_toolkit completer for slash commands & files
  data/                     # sqlite db, logs, transcripts (JSONL)
  tests/
```

## 2) Unified provider interface

* **`Provider.chat(messages, tools=None, system=None, stream=True, max_tokens=... )`**
  Adapters normalize:

  * **OpenAI Responses API** (+ tools/functions)
  * **Anthropic** (tools)
  * **Google/Vertex**, **Mistral**, **Groq**
  * **Local:** **Ollama** (HTTP), **vLLM** (OpenAI-compatible), **llama.cpp** server
* Token usage:

  * Prefer **provider-supplied usage**; else fallback to **tiktoken**/**anthropic-counting**/**approximation**.
* **Profiles** choose model + provider + defaults. Hot-switch: `/model gpt-5-mini` or `/provider ollama:qwq:8b`.

## 3) Tool bus (safe, uniform)

* A tiny internal protocol (`ToolRequest`, `ToolResult`) hides provider quirks.
* Built-ins: `shell.run(cmd, cwd, capture=N)`, `fs.read/write`, `git.status/diff/log`, etc.
* **MCP bridge tool:** `memory.create/context/decisions/tasks`, `memory.query(...)`, `memory.update(...)`.

  * Uses your **AIDIS MCP** so the CLI never talks to Postgres directly.
* Guardrails for shell:

  * “Dry-run” preview + **confirm** for mutating commands.
  * Allowlist of safe commands; deny `rm -rf`, disk format, etc.
  * `/bash` for you; **LLM shell tool** requires confirmation token.

## 4) Telemetry & on-screen stats

* **Middleware** wraps every call:

  * start/end time, provider, model, latency
  * tokens in/out, tool calls, streaming duration
  * rolling cost (if price table configured)
* Persist per **session** (UUID) to **SQLite** and render live:

  * status bar: `model | tokens(in/out) | tools | latency p50/p95 | cost | session time`
  * `/stats` prints tables; `/stats export` → CSV/JSON.
  * Efficiency heuristics (tokens/min, tool-call success rate).

## 5) REPL & slash commands

* **One-shot mode:** `ridge "explain file X"` (good for scripts/CI).
* **REPL mode** with:

  * `/model <name>` switch model
  * `/provider <id>` switch provider/endpoint
  * `/bash <cmd>` run shell, capture last N lines to attach
  * `/attach <path|last-bash>` add to next prompt context
  * `/tool <name> <args>` direct tool calls (use aidis_tools, example: aidis_ping)
  * `/mem save|query ...` hit MCP for context/decisions/tasks
  * `/stats`, `/profile use dev`, `/log tail`, `/save transcript`
  * `/md on|off` toggle Markdown rendering
* Prompt shows current **profile**, **model**, **tokens this session**.

## 6) Markdown & code rendering

* **Rich Markdown** with fenced code blocks & syntax highlight.
* **Tables:** Rich Tables + optional CSV export.
* Auto-fold overly long outputs; `Enter` to expand.

## 7) Configuration & secrets

* `~/.ridge/config.toml`:

  * providers: keys, base URLs, model defaults, pricing
  * profiles: “default”, “cheap”, “local”, “reasoning”
  * limits: max\_tokens, tool budget per turn, confirm-on-dangerous
* Secrets via env; never commit keys.

## 8) Packaging & DX

* `pipx install ridge-cli` (PEP 660 editable for dev).
* Logging: JSONL per session under `data/sessions/`.
* Transcripts saved as markdown + JSON (replayable).

## 9) Tests & reliability

* **Replay tests**: record a call once, replay without network.
* **Adapters** have unit tests for token accounting & streaming.
* **End-to-end** smoke with a fake provider.

---

# Why this is the best fit for *you*

* **Leverages your strengths (Python + Rich)**: fastest path to a polished TUI with minimal overhead.
* **Provider abstraction keeps you nimble**: swap **GPT-5 ↔ Claude ↔ local Qwen/vLLM/Ollama** with one interface. Your “project-manager local LLM + big-brain remote” pattern drops right in via profiles.
* **MCP-first memory**: your Postgres/pgvector stays behind an MCP tool—clean boundary, easy to evolve schemas, and the CLI is just a client.
* **Cost/latency awareness built-in**: live stats + SQLite telemetry give you the feedback loop to tune provider choice, prompt size, and tool frequency.
* **Safety for shell tools**: you can grant yourself `/bash` freedom while forcing model-initiated shell runs through confirmations and allowlists.
* **Lifetime extensibility**: the **registry** pattern (providers/tools/renderers) means you can add a new provider or tool by dropping in one file.

---

# Milestones (you can knock out v0.1 in a weekend)

**M1 – Skeleton & REPL (Day 1)**
Typer app + prompt\_toolkit input, Rich output, config loader, `/model`, `/provider`, `/send`, transcripts.

**M2 – Providers (Day 1–2)**
Implement `openai_.py`, `anthropic_.py`, `ollama_.py`, `vllm_.py` (OpenAI-compatible), unified `Provider.chat()` + streaming.

**M3 – Telemetry (Day 2)**
SQLite + middleware; live status bar; `/stats`.

**M4 – Tools & MCP (Day 2–3)**
`shell.run`, `fs.*`, `git.*`, `mcp_bridge` (create/query context/decisions/tasks).

**M5 – UX polish (Day 3)**
Markdown rendering, code fences, `/attach <last-bash>`, `/save transcript`, profiles.

---

# Key design details (so you can implement cleanly)

**Provider interface (simplified):**

```python
class Provider(Protocol):
    name: str
    supports_tools: bool
    async def chat(self, messages, tools=None, system=None, stream=True, **kw) -> ChatResult: ...
    def count_tokens(self, messages) -> TokenUsage: ...
```

**Message bus**:

* Assembles system + memory context (from MCP) + user message.
* Invokes provider, handles tool calls through Tool Bus, loops until done.
* Emits events: `on_send`, `on_stream_chunk`, `on_tool_call`, `on_complete` → Telemetry.

**Telemetry schema (SQLite):** `sessions`, `turns`, `tool_calls`, `providers`

* `turns`: tokens\_in/out, latency\_ms, model, cost\_estimate, tool\_count.

**Shell tool safety:**

* `dry_run=True` previews; require `/confirm <id>` for destructive ops.
* Capture stdout/stderr (last N lines) as attachable context.

---

# Reasoned trade-offs

* **Textual vs Rich + prompt\_toolkit**: Textual is gorgeous but heavier. Rich + prompt\_toolkit gives you immediate REPL ergonomics, fewer moving parts, and you can migrate to Textual later if you want panes.
* **SQLite for telemetry**: zero-ops, fast, perfect for local dev; if you later want global dashboards, stream events to Postgres via your MCP.
* **OpenAI-compatible local endpoints first** (vLLM, LM Studio, some Ollama routes): reduces adapter surface; pure vendor SDKs added only when needed (Anthropic/Google).



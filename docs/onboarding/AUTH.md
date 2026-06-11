# Mandrel — Security & Privacy

**Short version:** you get your own private, isolated instance. Your data isn't in a shared database with other users' — it's your own.

## Isolation (the core of it)
Every user runs on their **own instance** — own container, own PostgreSQL database, own access token, own subdomain + TLS certificate. This is *not* multi-tenant (where everyone's data sits in one database, separated only by an ID column). Your data is **physically separate**. One user cannot reach another's.

## How your agent connects
- Your coding agent (Claude Code / Amp) authenticates with a **strong per-instance bearer token**, over **HTTPS/TLS**.
- The endpoint is **fail-closed** — no valid token, no access, period.
- Plus DNS-rebinding protection, and the internal admin interface is never exposed publicly.

## The dashboard
- Its own **login** — username + password, bcrypt-hashed, rate-limited.
- Your instance gets its **own admin credential** — no shared or default password ships.

## Your privacy
- **Embeddings run locally on your instance** — your code and context are *not* sent to a third-party AI to be indexed. Zero-cost, and nothing leaves your box for that.
- **We (the operator) see stats, not content** — session counts, timestamps, health, so we can keep your instance running. Never your actual decisions, code, or context.

## What it's NOT (yet) — straight with you
This is an early, founding-tester product. The fundamentals are solid, but it is **not yet**:
- OAuth / SSO
- MFA
- Multiple users per instance / role-based permissions (single admin per instance today)
- Automatic token rotation (it's manual right now)
- Encryption-at-rest or formal compliance (SOC 2, etc.)

Those are on the roadmap — and as a founding tester, your input shapes the order. **Your data is private and isolated today;** the rest is us building in the open.

Questions about any of this? Just ask — happy to go as deep as you want.

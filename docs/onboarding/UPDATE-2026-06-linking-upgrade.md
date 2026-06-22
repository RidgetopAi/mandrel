<!--
  EXISTING-USER UPDATE EMAIL — "Mandrel just got a memory upgrade" (2026-06)
  Announces the Mandrel core linking/trust release (v0.5.15: context_update, links
  param, typed-edge graph, recall_thread, session active-thread auto-threading,
  trust-on-recall) to current founding testers AFTER the fleet rollout completes.

  HOW TO SEND: Ridge can send as brianj@ridgetopai.net via Squire (gmail.send).
  Personalize {{FIRST_NAME}} per recipient, or drop the line for a generic send.
  Send AFTER their instance is confirmed on the new version (rollout GREEN), so the
  tools the email mentions are actually live for them.

  Nothing in this release breaks existing usage — it is additive. No action required;
  the "one thing worth doing" is optional polish.
-->

**Subject:** Mandrel just got a big memory upgrade — nothing to do on your end

---

Hi {{FIRST_NAME}},

Quick note: your Mandrel instance just got its biggest upgrade since you came on board. **Nothing breaks, nothing for you to install** — it's already live on your instance. Here's what changed and the one small thing worth doing.

**Your memory now connects itself into a story.**
Before, your agent saved decisions, fixes, and notes as separate entries. Now they link together — a decision connects to the work that came from it, the bug that caused it, the fix that resolved it. Your agent can pull the whole thread of *"how did we get here"* in one step instead of stitching it together from search results.

**Three things that are new:**
- **Read-me-in-on-the-story (`recall_thread`).** Point your agent at any task or decision and it gets the connected history — in order, not a pile of search hits.
- **Auto-linking.** Your agent sets what it's working on once, and everything it saves after that connects to it automatically. No manual tagging to remember, so the history actually stays connected.
- **A trust signal on every memory.** Recall now tells your agent what's *proven* versus what's *stale or has been replaced* — so it leans on what held up and is wary of what didn't. (This is the part we're most excited about: your memory learns what was actually right.)

**The one thing worth doing (optional, 1 minute):**
If you added the Mandrel habits block to your `CLAUDE.md` / `AGENTS.md` when you set up, it's worth refreshing it to pick up the new workflow — two small lines: have your agent run `recall_thread` to resume, and `thread_set` at the start of a piece of work so saves auto-connect. The updated block is in your **Connect Mandrel** setup doc (the same file we sent you). If you didn't add it, now's a great time — it's what makes the difference between memory that's *stored* and memory that's *used*.

That's it. Same private, isolated instance; same local embeddings (your code never leaves your box); same fail-closed token. This is purely your memory getting smarter.

As always — you're a founding tester, so if anything looks off or you want a hand updating your setup, just reply. Your feedback is steering this.

Thanks for being early. 🦾

Brian
RidgetopAi

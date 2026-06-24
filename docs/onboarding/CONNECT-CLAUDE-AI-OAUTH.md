# Connect Claude.ai (web) to a Mandrel tenant via OAuth — runbook

> **What this is:** the repeatable procedure to enable BA-1 OAuth 2.1 (better-auth) on a
> per-tenant Mandrel instance and connect Claude.ai's web "custom connector" to it.
> First proven live on the `brian` tenant, 2026-06-24 (decision `d8a40830`, BA-1/BA-2).
> **Product avenue:** "connect your Claude.ai to your own Mandrel as a thinking space" —
> a sellable positioning; this runbook is the operator side of that feature.

---

## 0. Model (read first)

- **Dual-path `/mcp`**: every tenant keeps its **static bearer token** working. OAuth is added
  *alongside* — enabling it never breaks existing Claude Code / static-token clients.
- **OAuth is OFF by default** (`MANDREL_OAUTH_ENABLED=false`). Deploying BA-1 code is a verified
  no-op until you set the env + flip the flag per tenant.
- **Routing**: tenants route `*.mandrel.ridgetopai.net` → nginx-wildcard → **Traefik** → Docker
  labels. The OAuth edge routing is **Traefik router labels**, NOT a dedicated nginx vhost.
- **Identities live in the tenant's own Postgres** (better-auth tables, migration `052`). No
  hosted IdP — "your data never leaves your box" stays literally true.
- **⚠️ better-auth MUST mount OFF `/api/auth`** — the Command UI dashboard already owns
  `/api/auth/{login,logout,profile,refresh,register}`. Use `MANDREL_OAUTH_BASE_PATH=/api/oauth`.
  If you leave the default `/api/auth`, the OAuth Traefik router steals the dashboard's login
  → dashboard `Login failed: ApiError: Not Found` (404). (Hit live on the brian tenant 2026-06-24.)

## 1. ⚠️ Hardening gates — DO NOT skip for a real customer

Enabling OAuth opens two surfaces that are **fine for a trusted/dogfood tenant but must be closed
before a paying customer** (tracked: BA-3 `c0fd62c8`, DCR-cap `a5b2861c`):

1. **Open Dynamic Client Registration** (`allowUnauthenticatedClientRegistration:true`, required
   for Claude.ai) — no cap/rate-limit/TTL on the `oauthClient` table. Add a cap + TTL sweep.
2. **Open sign-up** — better-auth email/password sign-up is open, so anyone hitting the tenant
   subdomain can create an account. Restrict (allow-list / invite / disable open sign-up).

**Never enable OAuth on production tenant-zero (`mandrel.ridgetopai.net`, the company brain)
without both of the above** — it holds all company data.

## 2. Prerequisites

- Tenant runs **BA-1 + the consent fix** — `main` ≥ `9b6ba2d` (the `oauth_query` consent fix).
  If unsure, deploy current main first (step 3).
- A trusted operator (you) running on the VPS as root.

## 3. Deploy current code to the tenant (OAuth still off — no-op)

```bash
cd /home/ridgetop/projects/ra-mandrel
bash scripts/fleet-deploy.sh --only <handle> --skip-ci --yes   # --skip-ci only if main is freshly green
```
Verify: container healthy, migration `052` applied (the 9 better-auth tables), OAuth off (404),
static intact (401):
```bash
docker exec mandrel-<handle>-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc \
  "select count(*) from information_schema.tables where table_name like '\''oauth%'\'' or table_name='\''jwks'\'';"'
# expect 5+
```

## 4. Add the OAuth env to the tenant env file

`/root/.mandrel-<handle>.env` (mode 600). The secret is generated, never echoed:
```bash
ENV=/root/.mandrel-<handle>.env
cp -a "$ENV" "$ENV.bak-oauth-$(date +%s)"
cat >> "$ENV" <<EOF
MANDREL_OAUTH_ENABLED=true
MANDREL_OAUTH_ISSUER=https://<handle>.mandrel.ridgetopai.net
MANDREL_OAUTH_RESOURCE=https://<handle>.mandrel.ridgetopai.net/mcp
MANDREL_OAUTH_BASE_PATH=/api/oauth
EOF
printf 'MANDREL_OAUTH_SECRET=%s\n' "$(openssl rand -hex 32)" >> "$ENV"   # required in prod (fail-closed)
```
> `MANDREL_OAUTH_BASE_PATH=/api/oauth` is **mandatory** — the default `/api/auth` collides with the
> dashboard (see §0). The issuer becomes `https://<handle>.mandrel.ridgetopai.net/api/oauth`.
> `MANDREL_OAUTH_CORS_ORIGINS` defaults to `https://claude.ai` (already correct). Config contract:
> `mcp-server/src/config/betterAuthConfig.ts`.

## 5. Wire the compose: env refs + Traefik OAuth router

Edit `docker-compose.<handle>.yml` (back it up first). In the **mcp-server `environment:`** block add:
```yaml
      MANDREL_OAUTH_ENABLED: "${MANDREL_OAUTH_ENABLED:-false}"
      MANDREL_OAUTH_ISSUER: "${MANDREL_OAUTH_ISSUER:-}"
      MANDREL_OAUTH_RESOURCE: "${MANDREL_OAUTH_RESOURCE:-}"
      MANDREL_OAUTH_SECRET: "${MANDREL_OAUTH_SECRET:-}"
      MANDREL_OAUTH_BASE_PATH: "${MANDREL_OAUTH_BASE_PATH:-/api/auth}"
```
In the **mcp-server `labels:`** block, add an OAuth router (mirrors the `<handle>-mcp` `/mcp` router;
routes discovery + better-auth API + the sign-in/consent pages to the mcp-server). **Note `/api/oauth`,
NOT `/api/auth`** (the dashboard owns `/api/auth`):
```yaml
      - "traefik.http.routers.<handle>-oauth.rule=Host(`<handle>.mandrel.ridgetopai.net`) && (PathPrefix(`/.well-known/oauth`) || PathPrefix(`/.well-known/openid`) || PathPrefix(`/api/oauth`) || PathPrefix(`/sign-in`) || PathPrefix(`/consent`))"
      - "traefik.http.routers.<handle>-oauth.entrypoints=web"
      - "traefik.http.routers.<handle>-oauth.priority=100"
      - "traefik.http.routers.<handle>-oauth.service=<handle>-mcp-svc"
```
> Scope the `.well-known` prefixes to `oauth`/`openid` (NOT all `/.well-known/`) so ACME challenges
> are never intercepted.

## 6. Recreate the mcp-server (picks up env + labels)

```bash
cd /home/ridgetop/projects/ra-mandrel
docker compose -f docker-compose.yml -f docker-compose.<handle>.yml \
  --env-file /root/.mandrel-<handle>.env -p mandrel-<handle> up -d --no-deps mcp-server
```

## 7. Verify before handing off the connect

```bash
H=<handle>.mandrel.ridgetopai.net
curl -s -o /dev/null -w "protected-resource %{http_code} (200)\n"   https://$H/.well-known/oauth-protected-resource
curl -s -o /dev/null -w "auth-server meta   %{http_code} (200)\n"   https://$H/.well-known/oauth-authorization-server
curl -s -o /dev/null -w "sign-in page       %{http_code} (200)\n"   https://$H/sign-in
curl -s -o /dev/null -w "/mcp no-token      %{http_code} (401)\n" -X POST https://$H/mcp -d '{}'
# discovery docs must reference https://<handle>.mandrel.ridgetopai.net (resource) and .../api/auth (issuer)
```
Also confirm the **static token still authorizes** (backward-compat): source the tenant env file and
POST `initialize` with `Authorization: Bearer $MCP_AUTH_TOKEN` → expect 200.

## 8. Customer connect steps (hand these to the user)

1. **Claude.ai → Settings → Connectors → Add custom connector**
2. URL: **`https://<handle>.mandrel.ridgetopai.net/mcp`**
3. Flow: discovery → self-register (DCR) → **your tenant's sign-in page** (create account, first user)
   → **Approve** consent → redirected back → connected, tools appear.
4. If Claude holds a stale failed attempt: remove + re-add the connector.

---

## Gotchas (hard-won — see lesson 016)

- **Consent page must POST `oauth_query`** (the consent page's own signed query string), NOT `code`.
  better-auth's consent endpoint needs the signed `oauth_query` (via the `oAuthState` cookie, which
  isn't present in Claude.ai's cross-site flow, OR the body field). Fixed in `oauthPages.ts`
  (commit `9b6ba2d`); also use the `{redirect:true,url}` response shape so a successful approve
  returns to the client. **A tenant on older code will fail consent with `400 "missing oauth query"`.**
- **Issuer has a `/api/auth` path** (`baseURL + basePath`). Discovery docs are served at root and
  reference `.../api/auth` — verified to work with Claude.ai web.
- **`npm`/docker peer-deps**: better-auth pulls `better-call` which declares `peerOptional zod@^4`
  vs our pinned `zod@3`. `mcp-server/.npmrc` (`legacy-peer-deps=true`) + the Dockerfile `COPY .npmrc`
  before `npm ci` cover all three install contexts (CI / local / docker).

## Automation — the next step (BA-3)

Steps 4–6 are currently manual. Fold them into `scripts/provision-instance.sh` so a tenant is
OAuth-enabled by a single flag (it already mints `MCP_AUTH_TOKEN`; add the `MANDREL_OAUTH_*` mint +
the compose env refs + the Traefik OAuth router). **Gate the auto-enable behind the §1 hardening.**
Tracked: BA-3 `c0fd62c8`.

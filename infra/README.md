# Mandrel Fleet Infra — Traefik + Wildcard TLS (Infrastructure-as-Code)

Reproducible source of truth for the reverse-proxy / TLS layer that fronts the whole
Mandrel tenant fleet. Captured 2026-06-13 (task `3d4458b9`) from the live, running
stack so the architecture can be rebuilt from scratch.

> **IMPORTANT — the runtime is NOT yet deployed from this repo.** See
> [REMAINING GAP](#remaining-gap--what-still-blocks-full-reproducibility) at the bottom.
> These files are byte-identical snapshots of the live config; the live runtime still
> reads from `/opt/mandrel/traefik/` and `/etc/nginx/`, not from here.

---

## Architecture (what's live)

```
Cloudflare DNS                  nginx :443                 Traefik :8090            tenant container
(*.mandrel grey/DNS-only)  ->   (wildcard LE cert,    ->   (127.0.0.1 only,    ->   mcp-server:8080  (/mcp,/healthz)
 A *.mandrel -> VPS IP           terminates TLS,           plain HTTP,              frontend:3000    (catch-all)
 proxied=FALSE)                  SSE headers)              Docker-label routing)
```

- **Cloudflare DNS**: `A *.mandrel.ridgetopai.net -> 178.156.219.146`, **proxied=FALSE**
  (grey cloud — MCP stays a direct connection; a CF proxy/origin cert can't front grey
  MCP endpoints). One wildcard record covers every current and future tenant — new
  tenants need **no DNS change**.
- **nginx** terminates `:443` for `*.mandrel.ridgetopai.net` with a real Let's Encrypt
  **wildcard** cert and reverse-proxies **plain HTTP** to Traefik's localhost-only web
  entrypoint (`127.0.0.1:8090`). nginx stays authoritative for `:80`/`:443`.
  - Exact per-tenant `server_name` vhosts (where any still exist) win over the wildcard
    by nginx precedence, so the wildcard only catches hosts with no explicit vhost.
- **Traefik v3.3** (`ra-traefik`) does **pure Docker-label routing** — no TLS, no ACME.
  Bound to `127.0.0.1:8090` (data plane) and `127.0.0.1:8091` (api/dashboard) only;
  it NEVER touches `0.0.0.0:80/:443`.
- **Routing** is by Docker labels on each tenant's `mcp-server` + `frontend` containers
  (the proven label set, below). Traefik is joined to each tenant's Docker network so it
  can reach those containers by service name.

---

## Components captured here

| Path | Live source | Role |
|------|-------------|------|
| `traefik/docker-compose.traefik.yml` | `/opt/mandrel/traefik/docker-compose.traefik.yml` | The `ra-traefik` stack: traefik + apiver(haproxy) + socket-proxy |
| `traefik/traefik.yml` | `/opt/mandrel/traefik/traefik.yml` | Traefik v3 static config (entrypoints, docker provider, no ACME) |
| `traefik/haproxy-apiver.cfg` | `/opt/mandrel/traefik/haproxy-apiver.cfg` | Docker API version-prefix rewriter (`/v1.XX -> /v1.44`) |
| `nginx/mandrel-wildcard` | `/etc/nginx/sites-available/mandrel-wildcard` | nginx wildcard `:443` vhost (terminates TLS, proxies to Traefik) |

Per-tenant Traefik label edits live in each `docker-compose.<tenant>.yml`. Only
`docker-compose.app.yml` is tracked in git (the rest are `.gitignore`d as per-customer
local overrides — see the **Tenant compose tracking** note at the bottom). The proven
label set is documented below so any gitignored tenant can be reproduced.

---

## Reproduce from scratch

### 1. Wildcard TLS cert (Let's Encrypt DNS-01 via Cloudflare)

Requires a Cloudflare API token scoped `Zone -> DNS -> Edit` on `ridgetopai.net`, stored
in a creds file referenced **by path only** (never inline the token):

- `/root/.cf-dns-token` — the raw token (chmod 600), referenced by the ini below.
- `/root/.secrets/certbot-cloudflare.ini` (chmod 600) — points at the token file.

Issue the wildcard cert:

```bash
certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /root/.secrets/certbot-cloudflare.ini \
  -d '*.mandrel.ridgetopai.net' \
  --cert-name mandrel.ridgetopai.net-0001
```

Notes:
- Lineage is `/etc/letsencrypt/live/mandrel.ridgetopai.net-0001/` — the `-0001` suffix
  is because the plain `mandrel.ridgetopai.net` cert-name was already taken by the apex
  cert. The nginx vhost references this `-0001` lineage.
- Auto-renew: `certbot.timer` is active; renewal conf uses `authenticator=dns-cloudflare`.
  Verify with `certbot renew --cert-name mandrel.ridgetopai.net-0001 --dry-run`.
- **Never** print the token value; only reference the creds-file path.

### 2. Cloudflare DNS

`A *.mandrel.ridgetopai.net -> <VPS IP>`, **proxied = FALSE** (grey cloud).

### 3. nginx wildcard vhost

Install `nginx/mandrel-wildcard` to `/etc/nginx/sites-available/mandrel-wildcard`,
symlink into `sites-enabled/`, `nginx -t`, reload. It terminates the `-0001` wildcard
cert on `:443` and proxies plain HTTP to `127.0.0.1:8090` with full SSE/streaming
headers (`proxy_buffering off`, `Connection ''`, `proxy_http_version 1.1`,
`chunked_transfer_encoding on`, `proxy_read_timeout 3600s`) so MCP Streamable HTTP works.

### 4. Bring up Traefik

```bash
docker compose -f traefik/docker-compose.traefik.yml -p ra-traefik up -d
```

Then join `ra-traefik` to each tenant's Docker network so it can route to that tenant's
containers by service name (the compose file declares these networks as `external`):

```bash
# already declared in the compose `networks:` block as external; if joining a NEW tenant
# at runtime instead of via compose:
docker network connect mandrel-<tenant>_mandrel-network ra-traefik
```

### 5. The socket-proxy / apiver chain — WHY it exists

```
Traefik  --tcp-->  ra-traefik-apiver (haproxy, rewrites /v1.XX -> /v1.44)
         --tcp-->  ra-traefik-dsp (tecnativa docker-socket-proxy, RO least-priv API)
         --unix--> /var/run/docker.sock
```

This host's docker daemon sets **`MinAPIVersion=1.40`**. Traefik v3's embedded moby
client seeds API-version negotiation with a `/v1.24/version` ping, which the daemon
rejects with HTTP 400 ("client version 1.24 is too old"), so negotiation aborts and the
docker provider never loads. The **apiver** haproxy rewrites any `/v1.XX` prefix to
`/v1.44` (within the daemon's 1.40–1.54 range) so the seed ping succeeds. The
**socket-proxy** (tecnativa, pinned to an immutable digest, READ-ONLY socket, only
`CONTAINERS/NETWORKS/SERVICES/TASKS` enabled) means Traefik never touches the raw socket
— the recommended hardening pattern. The daemon itself is **not** modified (changing
`MinAPIVersion` would affect every tenant).

---

## Proven per-tenant LABEL SET

For each tenant `<h>` (host `<h>.mandrel.ridgetopai.net`), add to that tenant's compose:

On the **mcp-server** container:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.docker.network=mandrel-<h>_mandrel-network"
  # /mcp -> mcp-server:8080
  - "traefik.http.routers.<h>-mcp.rule=Host(`<h>.mandrel.ridgetopai.net`) && PathPrefix(`/mcp`)"
  - "traefik.http.routers.<h>-mcp.entrypoints=web"
  - "traefik.http.routers.<h>-mcp.priority=100"
  - "traefik.http.routers.<h>-mcp.service=<h>-mcp-svc"
  # /healthz -> mcp-server:8080
  - "traefik.http.routers.<h>-healthz.rule=Host(`<h>.mandrel.ridgetopai.net`) && PathPrefix(`/healthz`)"
  - "traefik.http.routers.<h>-healthz.entrypoints=web"
  - "traefik.http.routers.<h>-healthz.priority=100"
  - "traefik.http.routers.<h>-healthz.service=<h>-mcp-svc"
  - "traefik.http.services.<h>-mcp-svc.loadbalancer.server.port=8080"
```

On the **frontend** (Command UI) container:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.docker.network=mandrel-<h>_mandrel-network"
  - "traefik.http.routers.<h>-frontend.rule=Host(`<h>.mandrel.ridgetopai.net`)"
  - "traefik.http.routers.<h>-frontend.entrypoints=web"
  - "traefik.http.routers.<h>-frontend.priority=1"
  - "traefik.http.routers.<h>-frontend.service=<h>-frontend-svc"
  - "traefik.http.services.<h>-frontend-svc.loadbalancer.server.port=3000"
```

Rules that matter:
- `priority=100` on the `/mcp` + `/healthz` path routers, `priority=1` on the catch-all
  frontend router — so path matches always win over the catch-all.
- **NO `tls=true`** anywhere — nginx terminates the wildcard cert; Traefik speaks plain
  HTTP on its `web` entrypoint.
- `traefik.docker.network=mandrel-<h>_mandrel-network` so Traefik picks the right
  container IP (a tenant may be attached to more than one network).
- Also ensure `<h>.mandrel.ridgetopai.net` is in that tenant's `MCP_ALLOWED_HOSTS`, and
  `ra-traefik` is connected to `mandrel-<h>_mandrel-network`.

Onboarding a new tenant is therefore **labels-only** — no per-cert, no per-vhost, no
per-DNS (the wildcard cert + wildcard DNS already cover it).

---

## Tenant compose tracking (why only app.yml is in git)

`git status` shows only `docker-compose.app.yml` as modified because **it is the only
tenant compose that is tracked**. The repo's `.gitignore` explicitly excludes the
per-customer overrides so tester/customer handles don't leak into the (public) repo:

```
docker-compose.brian.yml
docker-compose.neko-trappings.yml
docker-compose.dmclark.yml
docker-compose.tomobobo.yml
docker-compose.bfenix.yml
docker-compose.staging.yml          # staging canary, non-customer
```

`docker-compose.app.yml` is the company-owned `app.` instance and is NOT gitignored, so
its Traefik label edit is the one tenant change that lands in git. The other tenants'
label edits live only on the box; they are reproducible from the **proven label set**
above. This is intentional: the per-customer composes carry tenant-specific specifics
and stay local.

---

## REMAINING GAP — what still blocks full reproducibility

Capturing these files into the repo makes the architecture **documented and rebuildable**,
but it does **not** yet make the runtime **deploy from** the repo. The last bit to fully
close task `3d4458b9`:

- **The live runtime still runs from `/opt/mandrel/traefik/`**, not from
  `ra-mandrel/infra/traefik/`. The `docker compose -p ra-traefik` stack reads
  `/opt/mandrel/traefik/docker-compose.traefik.yml` (+ the `traefik.yml` / haproxy cfg
  mounted from that same dir), and nginx reads `/etc/nginx/sites-available/mandrel-wildcard`.
- These repo copies are byte-identical snapshots, but there is **no deploy step** wiring
  the repo back to the runtime (e.g. symlink/copy `/opt/mandrel/traefik` <- `infra/traefik`,
  or a make/deploy script + drift-check). Until that exists, an edit here does not reach
  production, and a drift between repo and `/opt/mandrel` is possible.
- **To fully close reproducibility:** add a deploy path so the runtime is sourced FROM
  the repo (e.g. relocate the live stack to read from `infra/traefik/`, or a deploy script
  that copies repo -> `/opt/mandrel/traefik` + `/etc/nginx` and reloads, plus a drift
  check). That is the next task, to be run deliberately with the usual back-up-before-
  mutate discipline (the live stack must not be disturbed mid-flight).

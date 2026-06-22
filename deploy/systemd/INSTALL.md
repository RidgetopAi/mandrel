# systemd OnFailure failure-alerting — install note

Wires an **immediate Telegram alert** (URGENT 🔴) the moment a watched Mandrel
systemd service enters `failed`. Complements the existing 5-minute poll: catches
crash/restart storms the poll can miss (the 2026-06-19 prod crash-loop restarted
~83x silently — this would have caught it on the first failure).

## What's here

| File | Purpose |
|------|---------|
| `../../scripts/systemd-failure-alert.sh` | The alert script. Takes a unit name, pulls its last ~15 journal lines, Telegrams via `scripts/lib/ridge-notify.sh`. Config-driven, honors `NOTIFY_DRY_RUN`. |
| `ridge-failure-alert@.service` | Templated oneshot. `ridge-failure-alert@<unit>.service` runs the script for `%i`. |
| `mandrel.service.d/onfailure-alert.conf` | Drop-in adding `OnFailure=ridge-failure-alert@%n.service` to `mandrel.service`. |
| `mandrel-command.service.d/onfailure-alert.conf` | Same drop-in for `mandrel-command.service`. |

## Prerequisites

- `/root/.ridge-telegram.env` exists (chmod 600) with `TELEGRAM_BOT_TOKEN` +
  `TELEGRAM_CHAT_ID` — already present (used by every other Ridge alert script).
- `scripts/systemd-failure-alert.sh` is executable and reachable at the
  `ExecStart` path in `ridge-failure-alert@.service` (default `/opt/mandrel`).
  Adjust `ExecStart` if the prod checkout lives elsewhere.

## Install (Ridge applies after review — touches prod service config)

> These steps run `daemon-reload` and add drop-ins to the LIVE prod services.
> They do NOT restart `mandrel`/`mandrel-command`; a drop-in adding `OnFailure=`
> takes effect on reload without a restart of the watched unit.

```bash
# 1. Install the alert template unit.
install -m 0644 deploy/systemd/ridge-failure-alert@.service \
  /etc/systemd/system/ridge-failure-alert@.service

# 2. Install the OnFailure drop-ins for the watched prod services.
install -d /etc/systemd/system/mandrel.service.d
install -m 0644 deploy/systemd/mandrel.service.d/onfailure-alert.conf \
  /etc/systemd/system/mandrel.service.d/onfailure-alert.conf

install -d /etc/systemd/system/mandrel-command.service.d
install -m 0644 deploy/systemd/mandrel-command.service.d/onfailure-alert.conf \
  /etc/systemd/system/mandrel-command.service.d/onfailure-alert.conf

# 3. Reload so systemd picks up the new unit + drop-ins.
systemctl daemon-reload

# 4. Verify the drop-ins are attached (no restart needed).
systemctl show mandrel.service         -p OnFailure
systemctl show mandrel-command.service -p OnFailure
#   expect: OnFailure=ridge-failure-alert@mandrel.service   (and ...mandrel-command.service)
```

## Verify end-to-end (safe — uses a throwaway unit, NOT a prod service)

Prove the OnFailure path actually delivers, without touching prod:

```bash
# A one-shot unit that always fails, wired to the same alert template.
systemd-run --unit=ridge-alert-selftest --service-type=oneshot \
  -p 'OnFailure=ridge-failure-alert@%n.service' /bin/false
# Within seconds you should get a Telegram: "systemd unit FAILED: ridge-alert-selftest..."
systemctl reset-failed ridge-alert-selftest 2>/dev/null || true
```

## Tunables (config-driven — no hardcoding)

Set in `/root/.ridge-failure-alert.env` (optional) or as env:

- `FAILURE_ALERT_JOURNAL_LINES` (default 15)
- `FAILURE_ALERT_LEVEL` (default `urgent`)
- `FAILURE_ALERT_EMOJI` (default 🔴)

## Rollback

```bash
rm -f /etc/systemd/system/ridge-failure-alert@.service
rm -f /etc/systemd/system/mandrel.service.d/onfailure-alert.conf
rm -f /etc/systemd/system/mandrel-command.service.d/onfailure-alert.conf
systemctl daemon-reload
```

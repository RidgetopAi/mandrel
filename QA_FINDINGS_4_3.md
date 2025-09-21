# Phase 4.3 Verification – QA Findings

## Summary
Phase 4.3 cannot be signed off. Two blocking gaps were found while validating the verification package and live environment.

## Findings

1. **Critical – Task 4.3.1 (Kill redundant nodemon/ts-node processes) not satisfied.**
   - **Requirement:** Phase document states all redundant `nodemon`/`ts-node` processes must be terminated before completion.
   - **Observation:** Runtime inspection still shows four active watcher processes owned by `aidis-command` (`ps aux | grep -E 'nodemon|ts-node' | grep -v grep`). This contradicts the verification claim and leaves the original issue unresolved.
   - **Impact:** Redundant watchers continue consuming resources and can re-contend with the hardened supervisor, undermining the cleanup goal.
   - **Action:** Identify and disable the startup path that respawns these watchers, then verify the process list is clean.

2. **Major – Systemd health-check hardening uses unsupported directives.**
   - **Requirement:** Update the systemd service with production-ready health monitoring.
   - **Observation:** The new directives `HealthCheckProtocol`, `HealthCheckPath`, `HealthCheckInterval`, and `HealthCheckTimeout` added to `aidis.service:37` are not valid systemd unit keys, so no health probing occurs despite the documentation.
   - **Impact:** The claimed automatic health monitoring is non-functional; operators receive no alerts from systemd if the service becomes unhealthy.
   - **Action:** Replace the unsupported keys with a supported strategy (e.g., `ExecStartPre`/`ExecStartPost` scripts, `Restart=on-failure`, or a dedicated timer/service pair that curls `/health`).

## Next Steps
- Confirm the watcher processes stay terminated after removing their launch hooks.
- Update the systemd unit with a verifiable health-check mechanism and re-run phase validation.


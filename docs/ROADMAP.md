# Roadmap

## M0 — Public probe status (implemented locally)

- responsive English cockpit
- public probe lookup
- connection, network and uptime summary
- resilient empty/loading/error states
- model unit tests

Acceptance still requires browser testing against the live API.

## M1 — Turris package

- select the supported Turris OS baseline
- build an OpenWrt package with deterministic assets
- add an authenticated LuCI navigation entry
- install without opening a new listening port
- document backup, upgrade, removal and Schnapps rollback
- validate on a real Turris Omnia

## M2 — Local probe health

- read-only local adapter for installed package and service state
- compare local service state with RIPE Atlas public state
- display observation timestamps and distinguish unknown from offline
- never expose the probe private key

## M3 — Measurement views

- recent measurement participation
- latency and reachability trends
- bounded result queries and client-side summaries
- explicit freshness and partial-data indicators

## Deferred control-plane work

Creating or stopping measurements requires a separate threat model, least-privilege API keys, CSRF protection and an auditable router-local backend. It is not implied by the read-only cockpit.

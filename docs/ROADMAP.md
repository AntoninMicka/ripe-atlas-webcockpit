# Roadmap

## M0 — Public probe status (implemented locally)

- responsive English cockpit
- public probe lookup and network/uptime summary
- resilient empty/loading/error states
- model unit tests

## M1 — Turris integration (implemented, device acceptance open)

- install versioned assets without opening a new port
- add a Turris WebApps landing-page tile
- preserve a private token across guarded deploy/update runs
- validate lighttpd and restore owned files on installation failure
- package as a signed native Turris/OpenWrt package
- integrate a stable router authentication boundary
- validate on a real Turris Omnia

## M2 — Local probe health

- read-only adapter for installed probe package and service state
- compare local service state with RIPE Atlas public state
- display observation timestamps and distinguish unknown from offline
- never expose the probe private key

## M3 — Bounded measurements (implemented, live acceptance open)

- one-off ping and traceroute
- selection by region, countries, ASN, prefix, probe IDs or previous measurement
- at most 50 probes per request
- least-privilege router-local API key
- verify one real low-cost measurement and result link on a test account

## Deferred control-plane work

Recurring tests, stop operations and additional measurement types require an audit journal, explicit credit estimates and stronger router authentication.

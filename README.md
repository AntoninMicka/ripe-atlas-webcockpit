# RIPE Atlas Webcockpit

A small RIPE Atlas status and measurement dashboard designed for a Turris Omnia router.

Public probe status is fetched directly by the browser. On Turris, a deliberately narrow router-local CGI stores a RIPE Atlas API key and creates bounded one-off measurements without exposing the key to JavaScript storage.

## Current status

- English, responsive web interface
- Public probe lookup through RIPE Atlas API v2
- Router-local API-key storage with mode `0600`; the key is never returned
- One-off ping and traceroute creation from at most 50 probes
- Probe selection by region, countries, ASN, prefix, IDs or previous measurement
- Turris WebApps landing-page tile and existing-lighttpd integration
- Guarded deploy/update script with dry-run and pre-update backup
- Zero browser runtime dependencies and unit-tested data/request validation
- Real-device validation is still pending

This repository does **not** install or manage the RIPE Atlas software probe. Installation and registration remain separate administrative actions.

## Run locally

Requirements: Python 3 for the local static server and Node.js 20 or newer for tests.

```sh
npm run dev
```

Open <http://localhost:8080>. Public probe lookup works locally; the control panel reports unavailable until deployed with its router backend.

## Verify

```sh
npm test
npm run check
```

## Deploy or update on Turris

Preview the exact scope without connecting:

```sh
scripts/deploy-update.sh --target root@192.168.1.1 --dry-run
```

After reviewing the plan, apply it explicitly:

```sh
scripts/deploy-update.sh --target root@192.168.1.1 --yes
```

The script installs immutable release assets, a WebApps tile, one lighttpd include and a CGI endpoint. It opens no new port and preserves `/etc/ripe-atlas-webcockpit/access-token` across updates. Each run creates a timestamped backup below `/root/ripe-atlas-webcockpit-backups/`.

Do not treat static checks as proof of compatibility with a Turris Omnia. The tile, HTTPS route, CGI, restart, repeated update, real low-cost measurement and recovery must be verified on the target Turris OS release.

## Data and security

The browser stores only the last entered probe ID. The API key is stored outside the web root in a mode-`0600` file owned by the lighttpd service account and is passed to RIPE Atlas through a temporary mode-private request directory. Use a dedicated RIPE Atlas key with only measurement-creation permission. See [docs/SECURITY.md](docs/SECURITY.md).

The product name is **RIPE Atlas Webcockpit**. “RIPE Atlas” is a RIPE NCC service name; this independent project is not presented as an official RIPE NCC or CZ.NIC product.

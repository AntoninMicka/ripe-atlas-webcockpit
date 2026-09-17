# RIPE Atlas Webcockpit

A small, read-only RIPE Atlas dashboard designed for a Turris Omnia router.

The first milestone is deliberately narrow: enter a public RIPE Atlas probe ID and inspect its connection state, network identity, address families, uptime and tags. The browser talks directly to the public RIPE Atlas API, so the cockpit does not collect credentials or proxy traffic through a third party.

## Current status

- English, responsive web interface
- Public probe lookup through RIPE Atlas API v2
- Explicit loading, unavailable and stale-data states
- No API keys, router credentials or write operations
- Zero runtime dependencies
- Unit tests for API-data normalization
- Turris packaging and real-device validation are still pending

This repository does **not** install or manage the RIPE Atlas software probe. RIPE NCC documents Turris as a vendor-supported software-probe platform; installation and registration remain separate administrative actions.

## Run locally

Requirements: Python 3 for the local static server and Node.js 20 or newer for tests.

```sh
npm run dev
```

Open <http://localhost:8080>, enter a public probe ID and select **Load probe**.

## Verify

```sh
npm test
npm run check
```

## Target deployment

The intended production path is a Turris/OpenWrt package that installs immutable static assets under a router-local URL and adds a LuCI entry. No WAN listener is required. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [openwrt/README.md](openwrt/README.md).

Do not treat a local browser test as proof of compatibility with a Turris Omnia. Package installation, LuCI integration, Content Security Policy, API reachability and rollback must be verified on a supported Turris OS release.

## Data and security

The cockpit stores only the last entered probe ID in browser local storage. Public probe metadata is fetched from `https://atlas.ripe.net/api/v2/`. API keys are intentionally out of scope for this milestone. See [docs/SECURITY.md](docs/SECURITY.md).

## Project name

The product name is **RIPE Atlas Webcockpit**. “RIPE Atlas” is a RIPE NCC service name; this project is independent and is not presented as an official RIPE NCC or CZ.NIC product.

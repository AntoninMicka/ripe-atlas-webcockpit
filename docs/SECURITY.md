# Security model

## Trust boundary

The cockpit is intended for an authenticated router administration surface on a trusted LAN. It must not be exposed directly to the public Internet.

## Milestone 0 controls

- Read-only RIPE Atlas API calls only.
- No RIPE Atlas API key is accepted, stored or sent.
- Probe IDs are parsed as positive decimal integers before use in a URL.
- Network requests use HTTPS and a finite timeout.
- Remote values are rendered with DOM text nodes, not `innerHTML`.
- Only the selected public probe ID is kept in browser local storage.
- No analytics, tracking pixels, remote fonts or third-party scripts.

## Before router deployment

- Package the exact reviewed assets; record their checksums.
- Serve under the existing router web stack and authentication boundary.
- Add a restrictive Content Security Policy. It needs `connect-src https://atlas.ripe.net` while the browser calls the API directly.
- Confirm that the page is reachable from intended LAN interfaces only.
- Verify install, upgrade and removal on a Turris Omnia snapshot that can be rolled back.
- Confirm behavior when DNS, IPv4, IPv6 or RIPE Atlas is unavailable.

## Future authenticated API work

Do not put a RIPE Atlas API key in JavaScript or browser local storage. If private data or write operations are added, use a router-local backend with a least-privilege key, protected storage, CSRF defenses, an allowlisted operation schema and an audit trail.

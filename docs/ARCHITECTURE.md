# Architecture

## Data paths

Public status remains a static browser client. Secret-bearing requests use a narrow same-origin router endpoint.

```text
Browser on trusted LAN
        |-- HTTPS GET (public metadata) ----------> RIPE Atlas API v2
        |
        `-- same-origin JSON POST --> Turris lighttpd --> allowlisted CGI
                                                       |-- service-owned mode-0600 API key
                                                       `--> RIPE Atlas API v2
```

There is no database, analytics service or additional listener. The CGI accepts only token status/save/removal and bounded one-off ping/traceroute creation. It constructs the upstream request itself instead of forwarding arbitrary JSON.

## Modules

- `src/api.js` validates probe IDs and measurement requests and owns HTTP error handling.
- `src/model.js` maps external public-probe data to a small display model.
- `src/app.js` owns browser state and rendering.
- `openwrt/atlas-cgi.sh` owns token storage, server-side validation and authenticated Atlas requests.
- `openwrt/install.sh` installs a versioned release and restores owned files if lighttpd validation or restart fails.
- `scripts/deploy-update.sh` provides explicit dry-run and apply paths over SSH.

External data is rendered as text, never inserted as HTML. Browser validation is convenience only; the CGI independently validates every field.

## Turris boundary

The integration uses the established Turris WebApps landing-page definition and existing lighttpd instance. It does not open a new port. The current implementation relies on a trusted-LAN boundary plus same-origin/CSRF checks. A WebApps tile is navigation, not authentication; stable reForis authentication integration remains future hardening.

## Control-plane limits

- one-off `ping` and `traceroute` only
- IPv4 or IPv6
- at most 50 requested probes
- region, country, ASN, prefix, explicit-probe or previous-measurement selection
- no arbitrary API proxy, recurring measurements or stop operation
- no installation or management of the RIPE Atlas software probe

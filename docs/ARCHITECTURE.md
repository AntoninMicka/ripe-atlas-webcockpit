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

There is no database, analytics service or additional listener. The CGI accepts only token status/save/removal, authenticated lists of the key owner's measurements and probes, bounded latest-result reads, and bounded one-off ping/traceroute creation. It constructs upstream requests itself instead of forwarding arbitrary JSON.

The only persistent application data is the secret key and an allowlisted target registry under `/etc/ripe-atlas-webcockpit/`. A saved target contains a label, domain/IP, address family, probe selector and requested count. Saving a target does not schedule traffic; every measurement still requires an explicit user action and confirmation.

## Modules

- `src/api.js` validates probe IDs and measurement requests and owns HTTP error handling.
- `src/model.js` maps external public-probe data to a small display model.
- `src/app.js` owns browser state and rendering.
- `openwrt/atlas-cgi.sh` owns token storage, server-side validation and authenticated Atlas requests.
- `openwrt/install.sh` installs a versioned release and restores owned files if lighttpd validation, restart or the HTTPS CGI healthcheck fails.
- `scripts/deploy-update.sh` provides explicit dry-run and apply paths over SSH.

External data is rendered as text, never inserted as HTML. Browser validation is convenience only; the CGI independently validates every field.

## Turris boundary

The integration uses the established Turris WebApps landing-page definition and existing lighttpd instance. It does not open a new port. The current implementation relies on a trusted-LAN boundary plus same-origin/CSRF checks. A WebApps tile is navigation, not authentication; stable reForis authentication integration remains future hardening.

Turris already maps `/cgi-bin/` before application-specific aliases. The endpoint is therefore installed as `/www/cgi-bin/ripe-atlas-webcockpit`; the project lighttpd include must not add a competing `/cgi-bin/ripe-atlas-webcockpit` alias.

## Control-plane limits

- one-off `ping` and `traceroute` only
- IPv4 or IPv6
- at most 50 requested probes
- region, country, ASN, prefix, explicit-probe or previous-measurement selection
- reruns create a new one-off object and cap the reused previous-measurement probe set at 50
- only measurements returned by the configured key's `/measurements/my/` endpoint may be rerun
- latest-result reads are ownership-checked, request one version per probe and enforce a 1 MiB upstream response limit
- the browser renders at most 50 latest-result entries and links to RIPE Atlas for complete data
- at most 100 monitored targets, each independently revalidated before a one-off run
- no arbitrary API proxy, recurring measurements or stop operation
- no installation or management of the RIPE Atlas software probe

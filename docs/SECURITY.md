# Security model

## Trust boundary

The cockpit is intended for a trusted LAN or administrative VPN. It must not be exposed directly to the public Internet. The Turris WebApps landing page does not itself provide an authentication guarantee.

## Controls

- Public probe IDs are parsed as positive decimal integers before use in a URL.
- The API key is accepted only by the same-origin router endpoint, stored outside the web root with mode `0600` under the lighttpd service identity, never logged and never returned.
- The browser does not put the key in local or session storage.
- Measurement requests are reconstructed from an allowlist: one-off ping/traceroute, IPv4/IPv6, supported selectors and at most 50 probes.
- Existing-measurement reruns first resolve the ID through authenticated `/measurements/my/`; unsupported types and IDs not owned by the configured key are rejected.
- JSON content type, a custom request marker, same-origin fetch metadata and matching `Origin`/`Host` reduce CSRF and DNS-rebinding risk.
- curl receives the secret through a mode-private config file rather than a process argument. Temporary request files are removed after each request.
- A restrictive CSP permits only same-origin assets and RIPE Atlas API connections.
- Remote values are rendered with DOM text nodes; there are no third-party scripts, fonts, analytics or tracking pixels.

## Operational requirements

- Create a dedicated RIPE Atlas key with only the view/create measurement permissions needed by the cockpit.
- Keep router administration reachable only from intended LAN/VPN interfaces.
- Review the deploy dry-run and the owned-path list before applying.
- Verify install, update and recovery on a Schnapps-capable snapshot.
- Rotate the key if the router or a backup containing `/etc/ripe-atlas-webcockpit` is exposed.

## Residual risk and future work

A LAN user with direct endpoint access can currently create a bounded measurement. Stable Turris-session authentication and an audit journal should precede recurring measurements, stop controls, higher probe limits or additional Atlas operations.

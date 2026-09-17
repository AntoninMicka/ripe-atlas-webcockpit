# Architecture

## Scope

Milestone 0 is a static, read-only single-page application. It answers one operational question: “Is this public RIPE Atlas probe online, and what network identity is RIPE Atlas currently reporting for it?”

```text
Browser on trusted LAN
        |
        | HTTPS GET (public metadata only)
        v
RIPE Atlas REST API v2
```

No backend, database, analytics or secret store is required. This keeps the router footprint small and prevents the first version from becoming a credential-bearing control plane.

## Modules

- `src/api.js` validates the probe ID, applies a timeout and fetches the public probe resource.
- `src/model.js` maps the external API shape to a small display model and computes freshness labels.
- `src/app.js` owns browser state and rendering.
- `src/styles.css` provides a responsive UI without third-party assets.

External API objects are normalized before rendering. Unknown or missing fields display as `Not reported`; raw API values are never inserted as HTML.

## Turris boundary

Turris OS is based on OpenWrt and provides LuCI. The planned package will contain static assets and a LuCI menu entry. It should be LAN-only, inherit router authentication where integration permits it, and avoid opening a new network port.

The initial web application does not call local router commands. A later local-status adapter may expose a strict read-only schema for service state and installed package version. It must not return probe private keys, configuration secrets, logs with credentials, or arbitrary command output.

## Explicit non-goals for Milestone 0

- installing, registering, starting or stopping the RIPE Atlas probe
- storing a RIPE Atlas API key
- creating or stopping measurements
- changing firewall, DNS, routing or Turris configuration
- claiming real-device compatibility before router testing

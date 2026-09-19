# Turris integration

The integration uses the existing Turris lighttpd service and WebApps landing page:

- `/usr/share/ripe-atlas-webcockpit/releases/<timestamp>/` — immutable static release
- `/www/ripe-atlas` — symlink to the current release
- `/www/cgi-bin/ripe-atlas-webcockpit` — allowlisted CGI under Turris' existing `/cgi-bin/` mapping
- `/etc/ripe-atlas-webcockpit/access-token` — persistent mode-`0600` secret
- `/etc/ripe-atlas-webcockpit/targets.db` — persistent mode-`0600` monitored-target registry
- `/etc/lighttpd/conf.d/90-ripe-atlas-webcockpit.conf` — alias, CGI and security headers
- `/etc/turris-webapps/80-ripe-atlas-webcockpit.json` — landing-page tile

Use `scripts/deploy-update.sh`; do not run `install.sh` from an unreviewed source tree. The deploy script is a source deployment aid, not yet a signed native package.

The installer verifies required OpenWrt tools, backs up every owned path, tests the complete lighttpd configuration, restarts it, and calls the CGI status action through HTTPS. It restores the previous files if any of these checks fail. It never deletes or prints the persisted API key.

Real-device acceptance remains open. Verify the WebApps tile, HTTPS path, CSP, CGI execution, failed-key behavior, one low-cost measurement, repeated update, router reboot and Schnapps recovery on the selected Turris OS release.

The rerun workflow requires the standard OpenWrt `jsonfilter` command. The installer checks for it before modifying the deployment.

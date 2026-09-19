#!/bin/sh
# Install or update RIPE Atlas Webcockpit on Turris OS.
set -eu

SOURCE_DIR=""
for arg in "$@"; do
  case "$arg" in
    --source=*) SOURCE_DIR="${arg#--source=}" ;;
    *) printf 'Unknown argument: %s\n' "$arg" >&2; exit 2 ;;
  esac
done
[ -n "$SOURCE_DIR" ] || { printf 'Usage: install.sh --source=/path/to/extracted/repository\n' >&2; exit 2; }
[ "$(id -u)" -eq 0 ] || { printf 'This installer must run as root on the router.\n' >&2; exit 1; }
[ -d "$SOURCE_DIR/src" ] && [ -f "$SOURCE_DIR/openwrt/atlas-cgi.sh" ] || { printf 'Incomplete deployment bundle.\n' >&2; exit 1; }

for command_name in lighttpd curl tar; do
  command -v "$command_name" >/dev/null 2>&1 || { printf 'Missing required router command: %s\n' "$command_name" >&2; exit 1; }
done
[ -r /usr/share/libubox/jshn.sh ] || { printf 'Missing /usr/share/libubox/jshn.sh (install libubox/jshn).\n' >&2; exit 1; }
[ -f /etc/lighttpd/lighttpd.conf ] || { printf 'Turris lighttpd configuration was not found.\n' >&2; exit 1; }

APP_ROOT=/usr/share/ripe-atlas-webcockpit
RELEASES="$APP_ROOT/releases"
WEB_LINK=/www/ripe-atlas
CURRENT_LINK="$APP_ROOT/current"
CGI_DIR=/www/cgi-bin
CGI_PATH="$CGI_DIR/ripe-atlas-webcockpit"
LIGHTTPD_CONF=/etc/lighttpd/conf.d/90-ripe-atlas-webcockpit.conf
TILE=/etc/turris-webapps/80-ripe-atlas-webcockpit.json
ICON=/www/webapps-icons/ripe-atlas.svg
STATE=/etc/ripe-atlas-webcockpit
BACKUP_ROOT=/root/ripe-atlas-webcockpit-backups
stamp="$(date -u +%Y%m%dT%H%M%SZ)-$$"
release="$RELEASES/$stamp"
backup="$BACKUP_ROOT/$stamp"

if [ -e "$WEB_LINK" ] && [ ! -L "$WEB_LINK" ]; then
  printf '%s exists and is not a managed symlink; refusing to overwrite it.\n' "$WEB_LINK" >&2
  exit 1
fi
if [ -e "$CURRENT_LINK" ] && [ ! -L "$CURRENT_LINK" ]; then
  printf '%s exists and is not a managed symlink; refusing to overwrite it.\n' "$CURRENT_LINK" >&2
  exit 1
fi

mkdir -p "$RELEASES" "$CGI_DIR" "$STATE" "$BACKUP_ROOT" /etc/turris-webapps /www/webapps-icons
lighttpd_pid="$(pidof lighttpd 2>/dev/null | awk '{print $1}')"
[ -n "$lighttpd_pid" ] && [ -r "/proc/$lighttpd_pid/status" ] || { printf 'Could not determine the running lighttpd service account.\n' >&2; exit 1; }
lighttpd_uid="$(awk '/^Uid:/ {print $2}' "/proc/$lighttpd_pid/status")"
lighttpd_gid="$(awk '/^Gid:/ {print $2}' "/proc/$lighttpd_pid/status")"
[ -n "$lighttpd_uid" ] && [ -n "$lighttpd_gid" ] || { printf 'Empty lighttpd service identity.\n' >&2; exit 1; }
case "$lighttpd_uid:$lighttpd_gid" in *[!0-9:]*) printf 'Invalid lighttpd service identity.\n' >&2; exit 1 ;; esac
chown "$lighttpd_uid:$lighttpd_gid" "$STATE"
chmod 700 "$STATE"
if [ -e "$STATE/access-token" ]; then
  chown "$lighttpd_uid:$lighttpd_gid" "$STATE/access-token"
  chmod 600 "$STATE/access-token"
fi
mkdir -p "$backup"
for path in "$WEB_LINK" "$CURRENT_LINK" "$CGI_PATH" "$LIGHTTPD_CONF" "$TILE" "$ICON"; do
  if [ -e "$path" ] || [ -L "$path" ]; then
    relative="${path#/}"
    mkdir -p "$backup/$(dirname "$relative")"
    cp -a "$path" "$backup/$relative"
  fi
done

rollback() {
  status=$?
  [ "$status" -ne 0 ] || return 0
  trap - EXIT HUP INT TERM
  printf 'Installation failed; restoring the pre-update files from %s.\n' "$backup" >&2
  rm -f "$WEB_LINK" "$CURRENT_LINK" "$CGI_PATH" "$LIGHTTPD_CONF" "$TILE" "$ICON"
  if [ -d "$backup/www" ]; then cp -a "$backup/www/." /www/; fi
  if [ -d "$backup/usr" ]; then cp -a "$backup/usr/." /usr/; fi
  if [ -d "$backup/etc" ]; then cp -a "$backup/etc/." /etc/; fi
  /etc/init.d/lighttpd restart >/dev/null 2>&1 || true
  exit "$status"
}
trap rollback EXIT HUP INT TERM

mkdir -p "$release"
cp -a "$SOURCE_DIR/src/." "$release/"
cp "$SOURCE_DIR/openwrt/atlas-cgi.sh" "$CGI_PATH"
cp "$SOURCE_DIR/openwrt/90-ripe-atlas-webcockpit.conf" "$LIGHTTPD_CONF"
cp "$SOURCE_DIR/openwrt/ripe-atlas.svg" "$ICON"
chmod 0755 "$CGI_PATH"
chmod 0644 "$LIGHTTPD_CONF" "$ICON"
cat > "$TILE" <<'EOF'
{
  "id": "ripe-atlas-webcockpit",
  "title": "RIPE Atlas Webcockpit",
  "url": "/ripe-atlas/",
  "icon": "/webapps-icons/ripe-atlas.svg",
  "description": {
    "en": "Probe status and bounded one-off network measurements",
    "cz": "Stav sondy a omezená jednorázová síťová měření"
  }
}
EOF
chmod 0644 "$TILE"
ln -sfn "$release" "$CURRENT_LINK"
ln -sfn "$CURRENT_LINK" "$WEB_LINK"

lighttpd -tt -f /etc/lighttpd/lighttpd.conf
/etc/init.d/lighttpd restart
trap - EXIT HUP INT TERM

printf 'RIPE Atlas Webcockpit installed.\n'
printf 'URL: /ripe-atlas/\n'
printf 'Backup: %s\n' "$backup"
printf 'Token state was preserved at %s.\n' "$STATE"

#!/usr/bin/env bash
# Upload and install/update RIPE Atlas Webcockpit on a Turris router.
set -euo pipefail

target=""
mode="plan"
while (($#)); do
  case "$1" in
    --target) target="${2:-}"; shift 2 ;;
    --dry-run) mode="dry-run"; shift ;;
    --yes) mode="apply"; shift ;;
    -h|--help)
      echo "Usage: scripts/deploy-update.sh --target root@ROUTER [--dry-run|--yes]"
      exit 0
      ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

[[ -n "$target" ]] || { echo "--target is required" >&2; exit 2; }
[[ "$target" =~ ^[A-Za-z0-9._:@%+-]+$ ]] || { echo "Target contains unsupported characters." >&2; exit 2; }

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "Target: $target"
echo "Action: deploy/update static UI, CGI endpoint, lighttpd alias and Turris WebApps tile"
echo "Persistent token: preserved in /etc/ripe-atlas-webcockpit"
echo "Rollback snapshot: /root/ripe-atlas-webcockpit-backups/<UTC timestamp>"

if [[ "$mode" == "dry-run" ]]; then
  echo "Dry run complete; no connection was made and no router files were changed."
  exit 0
fi
if [[ "$mode" != "apply" ]]; then
  echo "Plan only. Re-run with --yes to connect and apply, or --dry-run for CI." >&2
  exit 2
fi

for command_name in ssh scp tar; do
  command -v "$command_name" >/dev/null || { echo "Missing local command: $command_name" >&2; exit 1; }
done

local_tmp="$(mktemp -d /tmp/ripe-atlas-deploy.XXXXXX)"
remote_tmp=""
cleanup() {
  rm -rf "$local_tmp"
  if [[ "$remote_tmp" =~ ^/tmp/ripe-atlas-deploy\.[A-Za-z0-9]+$ ]]; then
    ssh "$target" "rm -rf '$remote_tmp'" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT HUP INT TERM

tar -C "$repo_dir" -czf "$local_tmp/bundle.tgz" \
  src openwrt README.md docs package.json
remote_tmp="$(ssh "$target" 'mktemp -d /tmp/ripe-atlas-deploy.XXXXXX')"
[[ "$remote_tmp" =~ ^/tmp/ripe-atlas-deploy\.[A-Za-z0-9]+$ ]] || { echo "Router returned an unsafe temporary path." >&2; exit 1; }
scp "$local_tmp/bundle.tgz" "$target:$remote_tmp/bundle.tgz"
ssh "$target" "mkdir '$remote_tmp/source' && tar -xzf '$remote_tmp/bundle.tgz' -C '$remote_tmp/source' && sh '$remote_tmp/source/openwrt/install.sh' --source='$remote_tmp/source'"
echo "Deployment completed. Open https://ROUTER/ and select the RIPE Atlas Webcockpit tile."

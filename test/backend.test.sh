#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_dir="$(mktemp -d /tmp/ripe-atlas-backend-test.XXXXXX)"
trap 'rm -rf "$test_dir"' EXIT HUP INT TERM
export RIPE_ATLAS_CONFIG_DIR="$test_dir/config"
export RIPE_ATLAS_JSHN_LIB="$repo_dir/test/fixtures/fake-jshn.sh"
export RIPE_ATLAS_CURL_BIN="$repo_dir/test/fixtures/fake-curl.sh"
export FAKE_CURL_ARGS="$test_dir/curl-args"
export FAKE_CURL_PAYLOAD="$test_dir/payload.json"
export PATH="$repo_dir/test/fixtures:$PATH"

call_cgi() {
  local body="$1"
  printf '%s' "$body" | env \
    REQUEST_METHOD=POST CONTENT_TYPE=application/json CONTENT_LENGTH="${#body}" \
    HTTP_X_REQUESTED_WITH=ripe-atlas-webcockpit HTTP_SEC_FETCH_SITE=same-origin \
    HTTP_HOST=router.test HTTP_ORIGIN=https://router.test \
    sh "$repo_dir/openwrt/atlas-cgi.sh"
}

status_response="$(call_cgi '{"action":"status"}')"
[[ "$status_response" == *'"tokenConfigured":false'* ]]

token='12345678-1234-1234-1234-123456789abc'
save_response="$(call_cgi "{\"action\":\"token.save\",\"token\":\"$token\"}")"
[[ "$save_response" == *'"tokenConfigured":true'* ]]
[[ "$(stat -c '%a' "$RIPE_ATLAS_CONFIG_DIR/access-token")" == "600" ]]

request='{"action":"measurement.create","type":"ping","target":"example.net","description":"Turris test","af":4,"requested":5,"selectionType":"asn","selectionValue":"3333"}'
measurement_response="$(call_cgi "$request")"
[[ "$measurement_response" == *'"measurements":[424242]'* ]]
node -e 'const p=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); if (!p.is_oneoff || p.definitions[0].type!=="ping" || p.probes[0].type!=="asn" || p.probes[0].value!==3333 || p.probes[0].requested!==5) process.exit(1)' "$FAKE_CURL_PAYLOAD"
! grep -F "$token" "$FAKE_CURL_ARGS"

list_response="$(call_cgi '{"action":"measurements.list"}')"
[[ "$list_response" == *'"id":424200'* ]]
[[ "$list_response" == *'"name":"Stopped"'* ]]

rerun_response="$(call_cgi '{"action":"measurement.rerun","measurementId":424200}')"
[[ "$rerun_response" == *'"measurements":[424242]'* ]]
node -e 'const p=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); if (p.definitions[0].type!=="ping" || p.definitions[0].target!=="example.net" || p.probes[0].type!=="msm" || p.probes[0].value!==424200 || p.probes[0].requested!==50) process.exit(1)' "$FAKE_CURL_PAYLOAD"

cross_site="$(printf '%s' '{"action":"status"}' | env REQUEST_METHOD=POST CONTENT_TYPE=application/json CONTENT_LENGTH=19 HTTP_X_REQUESTED_WITH=ripe-atlas-webcockpit HTTP_SEC_FETCH_SITE=cross-site sh "$repo_dir/openwrt/atlas-cgi.sh")"
[[ "$cross_site" == *'403 Forbidden'* ]]
! grep -Eq '"/cgi-bin/ripe-atlas-webcockpit"[[:space:]]*=>' "$repo_dir/openwrt/90-ripe-atlas-webcockpit.conf"
grep -Fq 'CGI_PATH="$CGI_DIR/ripe-atlas-webcockpit"' "$repo_dir/openwrt/install.sh"
printf 'backend CGI contract: ok\n'

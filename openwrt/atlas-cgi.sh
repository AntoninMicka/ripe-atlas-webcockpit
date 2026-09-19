#!/bin/sh
# RIPE Atlas Webcockpit managed CGI endpoint.
set -u

CONFIG_DIR="${RIPE_ATLAS_CONFIG_DIR:-/etc/ripe-atlas-webcockpit}"
TOKEN_FILE="${RIPE_ATLAS_TOKEN_FILE:-$CONFIG_DIR/access-token}"
ATLAS_API_URL="${RIPE_ATLAS_API_URL:-https://atlas.ripe.net/api/v2/measurements/}"
JSHN_LIB="${RIPE_ATLAS_JSHN_LIB:-/usr/share/libubox/jshn.sh}"
CURL_BIN="${RIPE_ATLAS_CURL_BIN:-curl}"

respond() {
  status="$1"
  body="$2"
  printf 'Status: %s\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n\r\n%s\n' "$status" "$body"
  exit 0
}

bad_request() { respond "400 Bad Request" "{\"error\":\"$1\",\"code\":\"invalid_request\"}"; }

[ "${REQUEST_METHOD:-}" = "POST" ] || respond "405 Method Not Allowed" '{"error":"POST is required.","code":"method_not_allowed"}'
case "${CONTENT_TYPE:-}" in application/json*) ;; *) respond "415 Unsupported Media Type" '{"error":"JSON is required.","code":"unsupported_media_type"}' ;; esac
case "${HTTP_SEC_FETCH_SITE:-same-origin}" in same-origin|none) ;; *) respond "403 Forbidden" '{"error":"Cross-site requests are not allowed.","code":"cross_site_request"}' ;; esac
[ -z "${HTTP_ORIGIN:-}" ] || case "$HTTP_ORIGIN" in "http://${HTTP_HOST:-}"|"https://${HTTP_HOST:-}") ;; *) respond "403 Forbidden" '{"error":"Request origin does not match this router.","code":"origin_mismatch"}' ;; esac
[ "${HTTP_X_REQUESTED_WITH:-}" = "ripe-atlas-webcockpit" ] || respond "403 Forbidden" '{"error":"Missing same-origin request marker.","code":"missing_request_marker"}'
case "${CONTENT_LENGTH:-}" in ''|*[!0-9]*) bad_request "Invalid request length." ;; esac
[ "$CONTENT_LENGTH" -le 8192 ] || respond "413 Content Too Large" '{"error":"Request is too large.","code":"request_too_large"}'
[ -r "$JSHN_LIB" ] || respond "503 Service Unavailable" '{"error":"The OpenWrt JSON runtime is missing.","code":"missing_json_runtime"}'
command -v "$CURL_BIN" >/dev/null 2>&1 || respond "503 Service Unavailable" '{"error":"curl is not installed on the router.","code":"missing_curl"}'

# shellcheck source=/dev/null
. "$JSHN_LIB"
work_dir="$(mktemp -d /tmp/ripe-atlas-webcockpit.XXXXXX)" || respond "500 Internal Server Error" '{"error":"Could not allocate request storage.","code":"temporary_storage"}'
trap 'rm -rf "$work_dir"' EXIT HUP INT TERM
request_file="$work_dir/request.json"
dd of="$request_file" bs=1 count="$CONTENT_LENGTH" 2>/dev/null
json_load_file "$request_file" >/dev/null 2>&1 || bad_request "Malformed JSON."
json_get_var action action

case "$action" in
  status)
    if [ -s "$TOKEN_FILE" ]; then
      respond "200 OK" '{"tokenConfigured":true,"maxProbes":50,"testTypes":["ping","traceroute"],"selectionTypes":["region","countries","asn","prefix","probes","msm"]}'
    fi
    respond "200 OK" '{"tokenConfigured":false,"maxProbes":50,"testTypes":["ping","traceroute"],"selectionTypes":["region","countries","asn","prefix","probes","msm"]}'
    ;;
  token.save)
    json_get_var token token
    case "$token" in ''|*[!A-Za-z0-9._-]*) bad_request "Invalid API key format." ;; esac
    [ "${#token}" -ge 20 ] && [ "${#token}" -le 160 ] || bad_request "Invalid API key length."
    umask 077
    mkdir -p "$CONFIG_DIR" || respond "500 Internal Server Error" '{"error":"Could not create the private configuration directory.","code":"token_storage"}'
    token_tmp="$CONFIG_DIR/.access-token.$$"
    printf '%s\n' "$token" > "$token_tmp" || respond "500 Internal Server Error" '{"error":"Could not store the API key.","code":"token_storage"}'
    chmod 600 "$token_tmp" && mv -f "$token_tmp" "$TOKEN_FILE" || respond "500 Internal Server Error" '{"error":"Could not secure the API key.","code":"token_storage"}'
    respond "200 OK" '{"tokenConfigured":true}'
    ;;
  token.clear)
    [ ! -e "$TOKEN_FILE" ] || rm -f "$TOKEN_FILE" || respond "500 Internal Server Error" '{"error":"Could not remove the API key.","code":"token_storage"}'
    respond "200 OK" '{"tokenConfigured":false}'
    ;;
  measurement.create) ;;
  *) bad_request "Unknown action." ;;
esac

[ -s "$TOKEN_FILE" ] || respond "409 Conflict" '{"error":"Configure a RIPE Atlas API key first.","code":"token_required"}'
json_get_var type type
json_get_var target target
json_get_var description description
json_get_var af af
json_get_var requested requested
json_get_var selection_type selectionType
json_get_var selection_value selectionValue

case "$type" in ping|traceroute) ;; *) bad_request "Unsupported measurement type." ;; esac
case "$af" in 4|6) ;; *) bad_request "Address family must be 4 or 6." ;; esac
case "$requested" in ''|*[!0-9]*) bad_request "Invalid probe count." ;; esac
[ "$requested" -ge 1 ] && [ "$requested" -le 50 ] || bad_request "Probe count must be between 1 and 50."
[ -n "$target" ] && [ "${#target}" -le 255 ] || bad_request "Invalid target."
case "$target" in *[!A-Za-z0-9._:-]*) bad_request "Target contains unsupported characters." ;; esac
[ -n "$description" ] && [ "${#description}" -le 128 ] || bad_request "Invalid description."
case "$description" in *[![:print:]]*) bad_request "Description contains control characters." ;; esac

case "$selection_type" in
  region) case "$selection_value" in ''|*[!a-z0-9_]*) bad_request "Invalid region." ;; esac ;;
  countries) case "$selection_value" in ''|*[!A-Z,]*) bad_request "Use uppercase ISO country codes." ;; esac ;;
  asn|msm) case "$selection_value" in ''|0|*[!0-9]*) bad_request "Use a positive numeric value." ;; esac ;;
  prefix) case "$selection_value" in ''|*[!A-Fa-f0-9.:/]*) bad_request "Invalid network prefix." ;; esac ;;
  probes) case "$selection_value" in ''|*[!0-9,]*) bad_request "Use comma-separated probe IDs." ;; esac ;;
  *) bad_request "Unsupported probe selection rule." ;;
esac

payload_file="$work_dir/measurement.json"
json_init
json_add_boolean is_oneoff 1
json_add_array definitions
json_add_object
json_add_string type "$type"
json_add_string target "$target"
json_add_string description "$description"
json_add_int af "$af"
json_close_object
json_close_array
json_add_array probes
json_add_object
json_add_int requested "$requested"
json_add_string type "$selection_type"
if [ "$selection_type" = "asn" ] || [ "$selection_type" = "msm" ]; then
  json_add_int value "$selection_value"
else
  json_add_string value "$selection_value"
fi
json_close_object
json_close_array
json_dump > "$payload_file"

curl_config="$work_dir/curl.conf"
umask 077
{
  printf '%s\n' 'silent' 'show-error' 'connect-timeout = 10' 'max-time = 30'
  printf 'url = "%s"\n' "$ATLAS_API_URL"
  printf '%s\n' 'request = "POST"' 'header = "Accept: application/json"' 'header = "Content-Type: application/json"'
  printf 'header = "Authorization: Key %s"\n' "$(sed -n '1p' "$TOKEN_FILE")"
} > "$curl_config"
response_file="$work_dir/response.json"
http_code="$($CURL_BIN --config "$curl_config" --data-binary "@$payload_file" --output "$response_file" --write-out '%{http_code}')"
curl_status=$?
[ "$curl_status" -eq 0 ] || respond "502 Bad Gateway" '{"error":"Could not reach RIPE Atlas.","code":"upstream_unavailable"}'
case "$http_code" in
  2??)
    printf 'Status: 201 Created\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n\r\n'
    cat "$response_file"
    ;;
  400) respond "400 Bad Request" '{"error":"RIPE Atlas rejected the measurement fields.","code":"atlas_rejected"}' ;;
  401|403) respond "403 Forbidden" '{"error":"The API key is invalid or lacks measurement permission.","code":"atlas_permission"}' ;;
  429) respond "429 Too Many Requests" '{"error":"RIPE Atlas rate or credit limits prevented creation.","code":"atlas_limit"}' ;;
  *) respond "502 Bad Gateway" '{"error":"RIPE Atlas returned an unexpected response.","code":"upstream_error"}' ;;
esac

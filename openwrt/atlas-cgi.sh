#!/bin/sh
# RIPE Atlas Webcockpit managed CGI endpoint.
# OpenWrt's jshn library is not guaranteed to be compatible with `set -u`.
# Keep all project-owned expansions explicitly defaulted instead.

CONFIG_DIR="${RIPE_ATLAS_CONFIG_DIR:-/etc/ripe-atlas-webcockpit}"
TOKEN_FILE="${RIPE_ATLAS_TOKEN_FILE:-$CONFIG_DIR/access-token}"
TARGETS_FILE="${RIPE_ATLAS_TARGETS_FILE:-$CONFIG_DIR/targets.db}"
ATLAS_API_BASE="${RIPE_ATLAS_API_BASE:-https://atlas.ripe.net/api/v2}"
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
  measurement.create|measurements.list|measurement.results|measurement.rerun|probes.list|target.run) ;;
  targets.list|targets.save|targets.remove) ;;
  *) bad_request "Unknown action." ;;
esac

validate_saved_target() {
  [ -n "$target" ] && [ "${#target}" -le 255 ] || bad_request "Invalid target."
  case "$target" in *[!A-Za-z0-9._:-]*) bad_request "Target contains unsupported characters." ;; esac
  case "$af" in 4|6) ;; *) bad_request "Address family must be 4 or 6." ;; esac
  case "$requested" in ''|*[!0-9]*) bad_request "Invalid probe count." ;; esac
  [ "$requested" -ge 1 ] && [ "$requested" -le 50 ] || bad_request "Probe count must be between 1 and 50."
  case "$selection_type" in
    region) case "$selection_value" in ''|*[!a-z0-9_]*) bad_request "Invalid region." ;; esac ;;
    countries) case "$selection_value" in ''|*[!A-Z,]*) bad_request "Use uppercase ISO country codes." ;; esac ;;
    asn|msm) case "$selection_value" in ''|0|*[!0-9]*) bad_request "Use a positive numeric value." ;; esac ;;
    prefix) case "$selection_value" in ''|*[!A-Fa-f0-9.:/]*) bad_request "Invalid network prefix." ;; esac ;;
    probes) case "$selection_value" in ''|*[!0-9,]*) bad_request "Use comma-separated probe IDs." ;; esac ;;
    *) bad_request "Unsupported probe selection rule." ;;
  esac
}

if [ "$action" = "targets.list" ]; then
  json_init
  json_add_array targets
  if [ -r "$TARGETS_FILE" ]; then
    while IFS='|' read -r saved_id saved_label saved_target saved_af saved_selection_type saved_selection_value saved_requested; do
      [ -n "$saved_id" ] || continue
      json_add_object
      json_add_string id "$saved_id"
      json_add_string label "$saved_label"
      json_add_string target "$saved_target"
      json_add_int af "$saved_af"
      json_add_string selectionType "$saved_selection_type"
      json_add_string selectionValue "$saved_selection_value"
      json_add_int requested "$saved_requested"
      json_close_object
    done < "$TARGETS_FILE"
  fi
  json_close_array
  printf 'Status: 200 OK\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n\r\n'
  json_dump
  exit 0
fi

if [ "$action" = "targets.save" ]; then
  json_get_var label label
  json_get_var target target
  json_get_var af af
  json_get_var requested requested
  json_get_var selection_type selectionType
  json_get_var selection_value selectionValue
  [ -n "$label" ] && [ "${#label}" -le 64 ] || bad_request "Label must contain 1 to 64 characters."
  case "$label" in *'|'*|*[![:print:]]*) bad_request "Label contains unsupported characters." ;; esac
  validate_saved_target
  saved_count=0
  [ ! -r "$TARGETS_FILE" ] || saved_count="$(wc -l < "$TARGETS_FILE")"
  [ "$saved_count" -lt 100 ] || respond "409 Conflict" '{"error":"At most 100 monitored targets can be stored.","code":"target_limit"}'
  mkdir -p "$CONFIG_DIR" || respond "500 Internal Server Error" '{"error":"Could not create private target storage.","code":"target_storage"}'
  umask 077
  targets_tmp="$CONFIG_DIR/.targets.$$"
  [ ! -r "$TARGETS_FILE" ] || cp "$TARGETS_FILE" "$targets_tmp"
  : > "${targets_tmp}.new"
  if [ -r "$targets_tmp" ]; then cat "$targets_tmp" > "${targets_tmp}.new"; fi
  saved_id="$(date +%s)$$"
  printf '%s|%s|%s|%s|%s|%s|%s\n' "$saved_id" "$label" "$target" "$af" "$selection_type" "$selection_value" "$requested" >> "${targets_tmp}.new"
  chmod 600 "${targets_tmp}.new" && mv -f "${targets_tmp}.new" "$TARGETS_FILE" || respond "500 Internal Server Error" '{"error":"Could not store the monitored target.","code":"target_storage"}'
  rm -f "$targets_tmp"
  respond "201 Created" "{\"id\":\"$saved_id\"}"
fi

if [ "$action" = "targets.remove" ]; then
  json_get_var target_id targetId
  case "$target_id" in ''|*[!0-9]*) bad_request "Invalid monitored target ID." ;; esac
  [ -r "$TARGETS_FILE" ] && grep -q "^$target_id|" "$TARGETS_FILE" || respond "404 Not Found" '{"error":"Monitored target not found.","code":"target_not_found"}'
  umask 077
  targets_tmp="$CONFIG_DIR/.targets.$$"
  awk -F '|' -v target_id="$target_id" '$1 != target_id { print }' "$TARGETS_FILE" > "$targets_tmp" || respond "500 Internal Server Error" '{"error":"Could not update monitored targets.","code":"target_storage"}'
  chmod 600 "$targets_tmp" && mv -f "$targets_tmp" "$TARGETS_FILE" || respond "500 Internal Server Error" '{"error":"Could not update monitored targets.","code":"target_storage"}'
  respond "200 OK" '{"removed":true}'
fi

[ -s "$TOKEN_FILE" ] || respond "409 Conflict" '{"error":"Configure a RIPE Atlas API key first.","code":"token_required"}'

curl_config="$work_dir/curl.conf"
response_file="$work_dir/response.json"
atlas_request() {
  request_method="$1"
  request_url="$2"
  request_payload="${3:-}"
  umask 077
  {
    printf '%s\n' 'silent' 'show-error' 'connect-timeout = 10' 'max-time = 30' 'max-filesize = 1048576'
    printf 'url = "%s"\n' "$request_url"
    printf 'request = "%s"\n' "$request_method"
    printf '%s\n' 'header = "Accept: application/json"'
    [ "$request_method" != "POST" ] || printf '%s\n' 'header = "Content-Type: application/json"'
    printf 'header = "Authorization: Key %s"\n' "$(sed -n '1p' "$TOKEN_FILE")"
  } > "$curl_config"
  if [ -n "$request_payload" ]; then
    http_code="$($CURL_BIN --config "$curl_config" --data-binary "@$request_payload" --output "$response_file" --write-out '%{http_code}')"
  else
    http_code="$($CURL_BIN --config "$curl_config" --output "$response_file" --write-out '%{http_code}')"
  fi
  curl_status=$?
  [ "$curl_status" -eq 0 ] || respond "502 Bad Gateway" '{"error":"Could not reach RIPE Atlas.","code":"upstream_unavailable"}'
}

upstream_error() {
  case "$http_code" in
    400) respond "400 Bad Request" '{"error":"RIPE Atlas rejected the request.","code":"atlas_rejected"}' ;;
    401|403) respond "403 Forbidden" '{"error":"The API key is invalid or lacks the required permission.","code":"atlas_permission"}' ;;
    404) respond "404 Not Found" '{"error":"The measurement was not found for this key.","code":"measurement_not_found"}' ;;
    429) respond "429 Too Many Requests" '{"error":"RIPE Atlas rate or credit limits prevented the request.","code":"atlas_limit"}' ;;
    *) respond "502 Bad Gateway" '{"error":"RIPE Atlas returned an unexpected response.","code":"upstream_error"}' ;;
  esac
}

if [ "$action" = "measurements.list" ]; then
  list_url="$ATLAS_API_BASE/measurements/my/?page_size=20&sort=-id&fields=id,type,target,description,status,is_oneoff,af,start_time,stop_time,probes_requested"
  atlas_request GET "$list_url"
  case "$http_code" in 2??) ;; *) upstream_error ;; esac
  printf 'Status: 200 OK\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n\r\n'
  cat "$response_file"
  exit 0
fi

if [ "$action" = "probes.list" ]; then
  probes_url="$ATLAS_API_BASE/probes/my/?page_size=100&fields=id,status,country_code,description,is_public,is_anchor,address_v4,address_v6,asn_v4,asn_v6,last_connected"
  atlas_request GET "$probes_url"
  case "$http_code" in 2??) ;; *) upstream_error ;; esac
  printf 'Status: 200 OK\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n\r\n'
  cat "$response_file"
  exit 0
fi

if [ "$action" = "measurement.results" ]; then
  command -v jsonfilter >/dev/null 2>&1 || respond "503 Service Unavailable" '{"error":"jsonfilter is required to load results.","code":"missing_jsonfilter"}'
  json_get_var measurement_id measurementId
  case "$measurement_id" in ''|0|*[!0-9]*) bad_request "Invalid measurement ID." ;; esac
  owner_url="$ATLAS_API_BASE/measurements/my/?id=$measurement_id&page_size=1&fields=id"
  atlas_request GET "$owner_url"
  case "$http_code" in 2??) ;; *) upstream_error ;; esac
  returned_id="$(jsonfilter -i "$response_file" -e '@.results[0].id')"
  [ "$returned_id" = "$measurement_id" ] || respond "404 Not Found" '{"error":"The measurement was not found for this key.","code":"measurement_not_found"}'
  latest_url="$ATLAS_API_BASE/measurements/$measurement_id/latest/?versions=1"
  atlas_request GET "$latest_url"
  case "$http_code" in 2??) ;; *) upstream_error ;; esac
  printf 'Status: 200 OK\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n\r\n'
  cat "$response_file"
  exit 0
fi

if [ "$action" = "measurement.rerun" ]; then
  command -v jsonfilter >/dev/null 2>&1 || respond "503 Service Unavailable" '{"error":"jsonfilter is required to rerun measurements.","code":"missing_jsonfilter"}'
  json_get_var measurement_id measurementId
  case "$measurement_id" in ''|0|*[!0-9]*) bad_request "Invalid measurement ID." ;; esac
  detail_url="$ATLAS_API_BASE/measurements/my/?id=$measurement_id&page_size=1&fields=id,type,target,description,af,probes_requested"
  atlas_request GET "$detail_url"
  case "$http_code" in 2??) ;; *) upstream_error ;; esac
  returned_id="$(jsonfilter -i "$response_file" -e '@.results[0].id')"
  [ "$returned_id" = "$measurement_id" ] || respond "404 Not Found" '{"error":"The measurement was not found for this key.","code":"measurement_not_found"}'
  type="$(jsonfilter -i "$response_file" -e '@.results[0].type')"
  target="$(jsonfilter -i "$response_file" -e '@.results[0].target')"
  af="$(jsonfilter -i "$response_file" -e '@.results[0].af')"
  requested="$(jsonfilter -i "$response_file" -e '@.results[0].probes_requested')"
  description="Rerun of RIPE Atlas measurement $measurement_id"
  selection_type=msm
  selection_value="$measurement_id"
  case "$requested" in ''|0|*[!0-9]*) requested=1 ;; esac
  [ "$requested" -le 50 ] || requested=50
elif [ "$action" = "target.run" ]; then
  json_get_var target_id targetId
  json_get_var type type
  case "$target_id" in ''|*[!0-9]*) bad_request "Invalid monitored target ID." ;; esac
  case "$type" in ping|traceroute) ;; *) bad_request "Unsupported measurement type." ;; esac
  saved_line="$(awk -F '|' -v target_id="$target_id" '$1 == target_id { print; exit }' "$TARGETS_FILE" 2>/dev/null)"
  [ -n "$saved_line" ] || respond "404 Not Found" '{"error":"Monitored target not found.","code":"target_not_found"}'
  IFS='|' read -r saved_id label target af selection_type selection_value requested <<EOF
$saved_line
EOF
  validate_saved_target
  description="Monitored target: $label"
else
  json_get_var type type
  json_get_var target target
  json_get_var description description
  json_get_var af af
  json_get_var requested requested
  json_get_var selection_type selectionType
  json_get_var selection_value selectionValue
fi

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

atlas_request POST "$ATLAS_API_BASE/measurements/" "$payload_file"
case "$http_code" in
  2??)
    printf 'Status: 201 Created\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n\r\n'
    cat "$response_file"
    ;;
  *) upstream_error ;;
esac

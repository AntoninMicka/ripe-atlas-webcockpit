#!/bin/sh
set -eu
printf '%s\n' "$@" > "$FAKE_CURL_ARGS"
output=""
payload=""
config=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --config) config="$2"; shift 2 ;;
    --output) output="$2"; shift 2 ;;
    --data-binary) payload="${2#@}"; shift 2 ;;
    *) shift ;;
  esac
done
if grep -Fq '/measurements/424200/latest/' "$config"; then
  printf '{"123":[{"type":"ping","prb_id":123,"avg":12.5,"min":11.8,"max":13.2,"sent":3,"rcvd":3,"timestamp":1700000000}]}\n' > "$output"
  printf '200'
elif grep -Fq '/measurements/my/?id=424200' "$config"; then
  printf '{"count":1,"results":[{"id":424200,"type":"ping","target":"example.net","description":"Existing test","af":4,"probes_requested":75}]}\n' > "$output"
  printf '200'
elif grep -Fq '/probes/my/' "$config"; then
  printf '{"count":1,"results":[{"id":123,"description":"My probe","country_code":"CZ","asn_v4":64500,"status":{"id":1,"name":"Connected"}}]}\n' > "$output"
  printf '200'
elif grep -Fq '/measurements/my/' "$config"; then
  printf '{"count":1,"results":[{"id":424200,"type":"ping","target":"example.net","description":"Existing test","af":4,"probes_requested":75,"status":{"id":4,"name":"Stopped"}}]}\n' > "$output"
  printf '200'
else
  cp "$payload" "$FAKE_CURL_PAYLOAD"
  printf '{"measurements":[424242]}\n' > "$output"
  printf '201'
fi

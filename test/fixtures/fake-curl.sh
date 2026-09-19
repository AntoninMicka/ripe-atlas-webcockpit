#!/bin/sh
set -eu
printf '%s\n' "$@" > "$FAKE_CURL_ARGS"
output=""
payload=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output) output="$2"; shift 2 ;;
    --data-binary) payload="${2#@}"; shift 2 ;;
    *) shift ;;
  esac
done
cp "$payload" "$FAKE_CURL_PAYLOAD"
printf '{"measurements":[424242]}\n' > "$output"
printf '201'

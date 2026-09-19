# Minimal jshn-compatible fixture for exercising the CGI contract on a non-OpenWrt host.
# This intentionally reads an unset optional variable. OpenWrt shell libraries are
# not guaranteed to be nounset-safe, and the production CGI must tolerate that.
if [ -z "$JSHN_OPTIONAL_STATE" ]; then JSHN_OPTIONAL_STATE=""; fi

json_load_file() {
  JSHN_INPUT="$1"
  export JSHN_INPUT
  node -e 'JSON.parse(require("fs").readFileSync(process.env.JSHN_INPUT, "utf8"))' >/dev/null
}

json_get_var() {
  destination="$1"
  key="$2"
  value="$(node -e 'const j=JSON.parse(require("fs").readFileSync(process.env.JSHN_INPUT,"utf8")); process.stdout.write(String(j[process.argv[1]] ?? ""))' "$key")"
  escaped="$(printf '%s' "$value" | sed "s/'/'\\\\''/g")"
  eval "$destination='$escaped'"
}

json_init() { CURRENT_ARRAY=""; OBJECT_INDEX=0; IS_ONEOFF=false; }
json_add_boolean() { [ "$1" = "is_oneoff" ] && IS_ONEOFF=true; }
json_add_array() { CURRENT_ARRAY="$1"; }
json_add_object() { OBJECT_INDEX=$((OBJECT_INDEX + 1)); }
json_close_object() { :; }
json_close_array() { :; }

json_add_string() {
  case "$CURRENT_ARRAY:$1" in
    definitions:type) DEF_TYPE="$2" ;;
    definitions:target) DEF_TARGET="$2" ;;
    definitions:description) DEF_DESCRIPTION="$2" ;;
    probes:type) PROBE_TYPE="$2" ;;
    probes:value) PROBE_VALUE="$2" ;;
  esac
}

json_add_int() {
  case "$CURRENT_ARRAY:$1" in
    definitions:af) DEF_AF="$2" ;;
    probes:requested) PROBE_REQUESTED="$2" ;;
    probes:value) PROBE_VALUE="$2" ;;
  esac
}

json_dump() {
  export IS_ONEOFF DEF_TYPE DEF_TARGET DEF_DESCRIPTION DEF_AF PROBE_TYPE PROBE_VALUE PROBE_REQUESTED
  node -e 'process.stdout.write(JSON.stringify({is_oneoff:process.env.IS_ONEOFF==="true",definitions:[{type:process.env.DEF_TYPE,target:process.env.DEF_TARGET,description:process.env.DEF_DESCRIPTION,af:Number(process.env.DEF_AF)}],probes:[{requested:Number(process.env.PROBE_REQUESTED),type:process.env.PROBE_TYPE,value:/^(asn|msm)$/.test(process.env.PROBE_TYPE)?Number(process.env.PROBE_VALUE):process.env.PROBE_VALUE}]}))'
}

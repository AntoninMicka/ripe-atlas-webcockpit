export const DEFAULT_API_BASE = "https://atlas.ripe.net/api/v2";
export const DEFAULT_CONTROL_ENDPOINT = "/cgi-bin/ripe-atlas-webcockpit";

export class AtlasApiError extends Error {
  constructor(message, code, status = null) {
    super(message);
    this.name = "AtlasApiError";
    this.code = code;
    this.status = status;
  }
}

const SELECTION_TYPES = new Set(["region", "countries", "asn", "prefix", "probes", "msm"]);
const TEST_TYPES = new Set(["ping", "traceroute"]);

function requiredText(value, label, maxLength = 255) {
  const text = String(value ?? "").trim();
  if (!text || text.length > maxLength || /[\u0000-\u001f\u007f]/.test(text)) {
    throw new AtlasApiError(`${label} is required and must be at most ${maxLength} characters.`, "invalid_measurement");
  }
  return text;
}

export function normalizeMeasurement(input) {
  const type = String(input?.type ?? "");
  const af = Number(input?.af);
  const requested = Number(input?.requested);
  const selectionType = String(input?.selectionType ?? "");
  if (!TEST_TYPES.has(type)) throw new AtlasApiError("Choose ping or traceroute.", "invalid_measurement");
  if (![4, 6].includes(af)) throw new AtlasApiError("Choose IPv4 or IPv6.", "invalid_measurement");
  if (!Number.isInteger(requested) || requested < 1 || requested > 50) {
    throw new AtlasApiError("Request between 1 and 50 probes.", "invalid_measurement");
  }
  if (!SELECTION_TYPES.has(selectionType)) {
    throw new AtlasApiError("Choose a supported probe selection rule.", "invalid_measurement");
  }
  return {
    type,
    target: requiredText(input?.target, "Target"),
    description: requiredText(input?.description, "Description", 128),
    af,
    requested,
    selectionType,
    selectionValue: requiredText(input?.selectionValue, "Selection value", 255)
  };
}

async function controlRequest(action, data = {}, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = options.endpoint ?? DEFAULT_CONTROL_ENDPOINT;
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-requested-with": "ripe-atlas-webcockpit"
      },
      body: JSON.stringify({ action, ...data })
    });
  } catch {
    throw new AtlasApiError("The router control endpoint is unavailable.", "control_unavailable");
  }
  let payload = {};
  try { payload = await response.json(); } catch { /* handled below */ }
  if (!response.ok) {
    throw new AtlasApiError(payload.error ?? "The router rejected the request.", payload.code ?? "control_error", response.status);
  }
  return payload;
}

export function fetchControlStatus(options = {}) {
  return controlRequest("status", {}, options);
}

export function saveAccessToken(token, options = {}) {
  const normalized = String(token ?? "").trim();
  if (!/^[A-Za-z0-9._-]{20,160}$/.test(normalized)) {
    throw new AtlasApiError("Enter a valid RIPE Atlas API key.", "invalid_token");
  }
  return controlRequest("token.save", { token: normalized }, options);
}

export function clearAccessToken(options = {}) {
  return controlRequest("token.clear", {}, options);
}

export function createMeasurement(input, options = {}) {
  return controlRequest("measurement.create", normalizeMeasurement(input), options);
}

export function listMeasurements(options = {}) {
  return controlRequest("measurements.list", {}, options);
}

export function rerunMeasurement(measurementId, options = {}) {
  const normalized = parseProbeId(measurementId);
  return controlRequest("measurement.rerun", { measurementId: normalized }, options);
}

export function fetchMeasurementResults(measurementId, options = {}) {
  const normalized = parseProbeId(measurementId);
  return controlRequest("measurement.results", { measurementId: normalized }, options);
}

export function listMyProbes(options = {}) {
  return controlRequest("probes.list", {}, options);
}

export function parseProbeId(value) {
  const text = String(value ?? "").trim();
  if (!/^[1-9]\d{0,9}$/.test(text)) {
    throw new AtlasApiError("Enter a positive numeric probe ID.", "invalid_probe_id");
  }
  return Number(text);
}

export async function fetchProbe(value, options = {}) {
  const probeId = parseProbeId(value);
  const apiBase = options.apiBase ?? DEFAULT_API_BASE;
  const timeoutMs = options.timeoutMs ?? 8000;
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`${apiBase}/probes/${probeId}/`, {
      headers: { accept: "application/json" },
      signal: controller.signal
    });

    if (response.status === 404) {
      throw new AtlasApiError(`Probe ${probeId} was not found or is not public.`, "not_found", 404);
    }
    if (!response.ok) {
      throw new AtlasApiError("RIPE Atlas returned an unexpected response.", "upstream_error", response.status);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof AtlasApiError) throw error;
    if (error?.name === "AbortError") {
      throw new AtlasApiError("RIPE Atlas did not respond before the request timed out.", "timeout");
    }
    throw new AtlasApiError("Could not reach the RIPE Atlas API.", "network_error");
  } finally {
    clearTimeout(timeout);
  }
}

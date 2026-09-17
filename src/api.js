export const DEFAULT_API_BASE = "https://atlas.ripe.net/api/v2";

export class AtlasApiError extends Error {
  constructor(message, code, status = null) {
    super(message);
    this.name = "AtlasApiError";
    this.code = code;
    this.status = status;
  }
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

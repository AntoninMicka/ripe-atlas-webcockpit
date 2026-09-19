import { AtlasApiError, clearAccessToken, createMeasurement, fetchControlStatus, fetchProbe, listMeasurements, rerunMeasurement, saveAccessToken } from "./api.js";
import { normalizeProbe } from "./model.js";

const $ = (selector) => document.querySelector(selector);
const form = $("#probe-form");
const input = $("#probe-id");
const welcome = $("#welcome");
const message = $("#message");
const dashboard = $("#dashboard");
const tokenForm = $("#token-form");
const measurementForm = $("#measurement-form");

function setText(selector, value) {
  $(selector).textContent = value;
}

function showMessage(title, detail, kind = "loading") {
  welcome.hidden = true;
  dashboard.hidden = true;
  message.hidden = false;
  message.className = `message panel ${kind}`;
  message.replaceChildren();
  const pulse = document.createElement("span");
  pulse.className = "message-mark";
  const copy = document.createElement("div");
  const heading = document.createElement("h2");
  const body = document.createElement("p");
  heading.textContent = title;
  body.textContent = detail;
  copy.append(heading, body);
  message.append(pulse, copy);
}

function renderTags(tags) {
  const container = $("#tags");
  container.replaceChildren();
  setText("#tag-count", String(tags.length));
  if (tags.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No public tags reported.";
    container.append(empty);
    return;
  }
  for (const tag of tags) {
    const chip = document.createElement("span");
    chip.textContent = tag;
    container.append(chip);
  }
}

function renderProbe(rawProbe) {
  const probe = normalizeProbe(rawProbe);
  setText("#probe-heading", `#${probe.id}`);
  setText("#probe-description", probe.description);
  setText("#country", probe.country);
  setText("#firmware", probe.firmware);
  setText("#uptime", probe.uptime);
  setText("#last-connected", probe.lastConnected);
  setText("#v4-address", probe.ipv4.address);
  setText("#v4-prefix", probe.ipv4.prefix);
  setText("#v4-asn", probe.ipv4.asn);
  setText("#v6-address", probe.ipv6.address);
  setText("#v6-prefix", probe.ipv6.prefix);
  setText("#v6-asn", probe.ipv6.asn);
  setText("#observed-at", new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "medium" }).format(new Date()));
  renderTags(probe.tags);

  const status = $("#status-pill");
  status.className = `status-pill ${probe.status.tone}`;
  status.lastElementChild.textContent = probe.status.label;
  $("#atlas-link").href = `https://atlas.ripe.net/probes/${probe.id}/`;

  message.hidden = true;
  welcome.hidden = true;
  dashboard.hidden = false;
}

async function loadProbe(probeId) {
  const button = form.querySelector("button");
  button.disabled = true;
  showMessage("Contacting RIPE Atlas…", "Requesting the latest public probe metadata.");
  try {
    const probe = await fetchProbe(probeId);
    localStorage.setItem("ripe-atlas-webcockpit.probe-id", String(probe.id));
    input.value = String(probe.id);
    renderProbe(probe);
  } catch (error) {
    const detail = error instanceof AtlasApiError ? error.message : "An unexpected error occurred.";
    showMessage("Probe data unavailable", detail, "error");
  } finally {
    button.disabled = false;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  loadProbe(input.value);
});

function setControlStatus(configured, detail) {
  const badge = $("#control-badge");
  badge.lastChild.textContent = configured ? " Control ready" : " Public mode";
  $("#token-status").textContent = detail;
  measurementForm.querySelector("button[type=submit]").disabled = !configured;
  $("#refresh-measurements").disabled = !configured;
}

async function refreshControlStatus() {
  try {
    const status = await fetchControlStatus();
    setControlStatus(status.tokenConfigured, status.tokenConfigured
      ? "A measurement key is configured. Its value cannot be read back."
      : "No measurement key is configured yet.");
    if (status.tokenConfigured) loadOwnedMeasurements();
  } catch {
    setControlStatus(false, "Router control is unavailable in this deployment. Public probe lookup still works.");
    tokenForm.querySelector("button[type=submit]").disabled = true;
    $("#clear-token").disabled = true;
  }
}

tokenForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = tokenForm.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    await saveAccessToken($("#access-token").value);
    tokenForm.reset();
    setControlStatus(true, "Measurement key saved securely on this router.");
    loadOwnedMeasurements();
  } catch (error) {
    $("#token-status").textContent = error instanceof AtlasApiError ? error.message : "Could not save the key.";
  } finally { button.disabled = false; }
});

$("#clear-token").addEventListener("click", async () => {
  if (!window.confirm("Remove the stored RIPE Atlas API key from this router?")) return;
  const button = $("#clear-token");
  button.disabled = true;
  try {
    await clearAccessToken();
    setControlStatus(false, "Measurement key removed from this router.");
    renderMeasurements([]);
  } catch (error) {
    $("#token-status").textContent = error instanceof AtlasApiError ? error.message : "Could not remove the key.";
  } finally { button.disabled = false; }
});

const selectionHelp = {
  region: "Examples: europe, western_europe, eu27.",
  countries: "Comma-separated ISO codes, for example CZ,DE,AT.",
  asn: "A positive AS number without the AS prefix, for example 3333.",
  prefix: "An IPv4 or IPv6 prefix, for example 192.0.2.0/24.",
  probes: "Comma-separated probe IDs, for example 1,2,3.",
  msm: "A previous measurement ID whose probes should be reused."
};
measurementForm.elements.selectionType.addEventListener("change", (event) => {
  $("#selection-help").textContent = selectionHelp[event.target.value];
});

measurementForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = measurementForm.querySelector("button[type=submit]");
  const result = $("#measurement-result");
  button.disabled = true;
  result.hidden = false;
  result.className = "control-result";
  result.textContent = "Submitting the bounded one-off test…";
  try {
    const values = Object.fromEntries(new FormData(measurementForm));
    const response = await createMeasurement(values);
    const measurementIds = Array.isArray(response.measurements) ? response.measurements : [];
    const ids = measurementIds.length ? measurementIds.join(", ") : "created";
    result.textContent = `Measurement ${ids} created. `;
    if (measurementIds.length) {
      const link = document.createElement("a");
      link.href = `https://atlas.ripe.net/measurements/${measurementIds[0]}/`;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = "Open in RIPE Atlas ↗";
      result.append(link);
    }
  } catch (error) {
    result.className = "control-result error";
    result.textContent = error instanceof AtlasApiError ? error.message : "Could not create the measurement.";
  } finally { button.disabled = false; }
});

function measurementStatus(measurement) {
  return measurement?.status?.name ?? measurement?.status_name ?? `Status ${measurement?.status?.id ?? measurement?.status ?? "unknown"}`;
}

function renderMeasurements(measurements) {
  const container = $("#measurements-list");
  container.replaceChildren();
  if (!measurements.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No measurements were returned for this key.";
    container.append(empty);
    return;
  }
  for (const measurement of measurements) {
    const supported = ["ping", "traceroute"].includes(measurement.type) && [4, 6].includes(Number(measurement.af));
    const row = document.createElement("div");
    row.className = "measurement-row";
    const main = document.createElement("div");
    main.className = "measurement-main";
    const title = document.createElement("strong");
    title.textContent = measurement.description || measurement.target || `Measurement #${measurement.id}`;
    const meta = document.createElement("span");
    meta.textContent = `#${measurement.id} · ${String(measurement.type).toUpperCase()} · IPv${measurement.af ?? "?"} · ${measurementStatus(measurement)} · ${measurement.probes_requested ?? "?"} probes`;
    main.append(title, meta);
    const actions = document.createElement("div");
    actions.className = "measurement-actions";
    const loadButton = document.createElement("button");
    loadButton.type = "button";
    loadButton.textContent = "Load into form";
    loadButton.disabled = !supported;
    loadButton.addEventListener("click", () => loadMeasurementIntoForm(measurement));
    const runButton = document.createElement("button");
    runButton.type = "button";
    runButton.className = "run-again";
    runButton.textContent = "Run again";
    runButton.disabled = !supported;
    runButton.addEventListener("click", () => runExistingMeasurement(measurement, runButton));
    actions.append(loadButton, runButton);
    row.append(main, actions);
    container.append(row);
  }
}

function loadMeasurementIntoForm(measurement) {
  measurementForm.elements.type.value = measurement.type;
  measurementForm.elements.af.value = String(measurement.af);
  measurementForm.elements.target.value = measurement.target ?? "";
  measurementForm.elements.description.value = `Rerun of #${measurement.id}`;
  measurementForm.elements.selectionType.value = "msm";
  measurementForm.elements.selectionValue.value = String(measurement.id);
  measurementForm.elements.requested.value = String(Math.min(Math.max(Number(measurement.probes_requested) || 1, 1), 50));
  measurementForm.elements.selectionType.dispatchEvent(new Event("change"));
  measurementForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadOwnedMeasurements() {
  const button = $("#refresh-measurements");
  const container = $("#measurements-list");
  button.disabled = true;
  container.textContent = "Loading measurements from RIPE Atlas…";
  try {
    const response = await listMeasurements();
    renderMeasurements(Array.isArray(response.results) ? response.results : []);
  } catch (error) {
    container.textContent = error instanceof AtlasApiError ? error.message : "Could not load measurements.";
  } finally { button.disabled = false; }
}

async function runExistingMeasurement(measurement, button) {
  if (!window.confirm(`Create a new one-off run based on measurement #${measurement.id}? RIPE Atlas credits may apply.`)) return;
  button.disabled = true;
  const result = $("#measurement-result");
  result.hidden = false;
  result.className = "control-result";
  result.textContent = `Creating a bounded rerun of #${measurement.id}…`;
  try {
    const response = await rerunMeasurement(measurement.id);
    const createdId = Array.isArray(response.measurements) ? response.measurements[0] : null;
    result.textContent = createdId ? `Measurement ${createdId} created. ` : "Measurement created. ";
    if (createdId) {
      const link = document.createElement("a");
      link.href = `https://atlas.ripe.net/measurements/${createdId}/`;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = "Open in RIPE Atlas ↗";
      result.append(link);
    }
    loadOwnedMeasurements();
  } catch (error) {
    result.className = "control-result error";
    result.textContent = error instanceof AtlasApiError ? error.message : "Could not rerun the measurement.";
  } finally { button.disabled = false; }
}

$("#refresh-measurements").addEventListener("click", loadOwnedMeasurements);

const savedProbeId = localStorage.getItem("ripe-atlas-webcockpit.probe-id");
if (savedProbeId) {
  input.value = savedProbeId;
  loadProbe(savedProbeId);
}
refreshControlStatus();

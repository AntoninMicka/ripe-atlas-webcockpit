import { AtlasApiError, clearAccessToken, createMeasurement, fetchControlStatus, fetchMeasurementResults, fetchProbe, listMeasurements, listMyProbes, listTargets, removeTarget, rerunMeasurement, runTarget, saveAccessToken, saveTarget } from "./api.js";
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
  $("#refresh-probes").disabled = !configured;
}

async function refreshControlStatus() {
  try {
    const status = await fetchControlStatus();
    setControlStatus(status.tokenConfigured, status.tokenConfigured
      ? "A measurement key is configured. Its value cannot be read back."
      : "No measurement key is configured yet.");
    if (status.tokenConfigured) {
      loadOwnedMeasurements();
      loadOwnedProbes();
    }
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
    loadOwnedProbes();
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
    renderProbes([]);
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
    const resultsButton = document.createElement("button");
    resultsButton.type = "button";
    resultsButton.textContent = "Results";
    resultsButton.addEventListener("click", () => loadLatestResults(measurement, resultsButton));
    actions.append(resultsButton, loadButton, runButton);
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

function formatResultTime(timestamp) {
  if (!Number.isFinite(Number(timestamp))) return "Time not reported";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(Number(timestamp) * 1000));
}

function summarizeResult(result) {
  if (result?.error) return String(result.error);
  if (Number.isFinite(Number(result?.avg))) {
    const delivery = Number.isFinite(Number(result?.rcvd)) && Number.isFinite(Number(result?.sent))
      ? ` · ${result.rcvd}/${result.sent} replies` : "";
    return `${Number(result.avg).toFixed(2)} ms average${delivery}`;
  }
  if (Array.isArray(result?.result)) {
    const hops = result.result.length;
    const reached = result.destination_ip_responded === true ? "destination reached" : "destination not confirmed";
    return `${hops} hops · ${reached}`;
  }
  return "Result available; open RIPE Atlas for the full type-specific detail.";
}

async function loadLatestResults(measurement, button) {
  button.disabled = true;
  const card = $("#results-card");
  const container = $("#measurement-results");
  card.hidden = false;
  $("#results-title").textContent = `Latest results · #${measurement.id}`;
  $("#results-atlas-link").href = `https://atlas.ripe.net/measurements/${measurement.id}/#results`;
  container.textContent = "Loading latest results…";
  try {
    const response = await fetchMeasurementResults(measurement.id);
    const entries = Object.entries(response).slice(0, 50);
    container.replaceChildren();
    if (!entries.length) {
      container.textContent = "No latest results are available yet.";
    } else {
      for (const [probeId, versions] of entries) {
        const result = Array.isArray(versions) ? versions[0] : null;
        const item = document.createElement("div");
        item.className = "result-item";
        const title = document.createElement("strong");
        title.textContent = `Probe #${result?.prb_id ?? probeId}`;
        const summary = document.createElement("span");
        summary.textContent = summarizeResult(result);
        const observed = document.createElement("span");
        observed.textContent = formatResultTime(result?.timestamp ?? result?.endtime);
        item.append(title, summary, observed);
        container.append(item);
      }
    }
    card.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    container.textContent = error instanceof AtlasApiError ? error.message : "Could not load measurement results.";
  } finally { button.disabled = false; }
}

function renderProbes(probes) {
  const container = $("#my-probes-list");
  container.replaceChildren();
  if (!probes.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No probes were returned for this key.";
    container.append(empty);
    return;
  }
  for (const probe of probes) {
    const row = document.createElement("div");
    row.className = "measurement-row";
    const main = document.createElement("div");
    main.className = "measurement-main";
    const title = document.createElement("strong");
    const dot = document.createElement("i");
    const status = probe?.status?.name ?? probe?.status_name ?? "Unknown";
    dot.className = `probe-status${String(status).toLowerCase() === "connected" ? " good" : ""}`;
    title.append(dot, document.createTextNode(probe.description || `Probe #${probe.id}`));
    const meta = document.createElement("span");
    const asn = probe.asn_v4 || probe.asn_v6;
    meta.textContent = `#${probe.id} · ${status} · ${probe.country_code || "??"}${asn ? ` · AS${asn}` : ""}${probe.is_anchor ? " · Anchor" : ""}`;
    main.append(title, meta);
    const link = document.createElement("a");
    link.className = "panel-link";
    link.href = `https://atlas.ripe.net/probes/${probe.id}/`;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "Open ↗";
    row.append(main, link);
    container.append(row);
  }
}

async function loadOwnedProbes() {
  const button = $("#refresh-probes");
  const container = $("#my-probes-list");
  button.disabled = true;
  container.textContent = "Loading probes from RIPE Atlas…";
  try {
    const response = await listMyProbes();
    renderProbes(Array.isArray(response.results) ? response.results : []);
  } catch (error) {
    container.textContent = error instanceof AtlasApiError ? error.message : "Could not load probes.";
  } finally { button.disabled = false; }
}

$("#refresh-probes").addEventListener("click", loadOwnedProbes);

function showTargetMessage(text, error = false) {
  const message = $("#targets-message");
  message.hidden = false;
  message.className = `control-result${error ? " error" : ""}`;
  message.textContent = text;
  return message;
}

function renderTargets(targets) {
  const container = $("#targets-list");
  container.replaceChildren();
  if (!targets.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No monitored targets saved on this router.";
    container.append(empty);
    return;
  }
  for (const target of targets) {
    const row = document.createElement("div");
    row.className = "measurement-row";
    const main = document.createElement("div");
    main.className = "measurement-main";
    const title = document.createElement("strong");
    title.textContent = target.label;
    const meta = document.createElement("span");
    meta.textContent = `${target.target} · IPv${target.af} · ${target.requested} probes by ${target.selectionType}: ${target.selectionValue}`;
    main.append(title, meta);
    const actions = document.createElement("div");
    actions.className = "measurement-actions";
    for (const type of ["ping", "traceroute"]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = type === "ping" ? "run-again" : "";
      button.textContent = type === "ping" ? "Ping" : "Traceroute";
      button.addEventListener("click", () => runSavedTarget(target, type, button));
      actions.append(button);
    }
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "Use in form";
    editButton.addEventListener("click", () => loadTargetIntoForm(target));
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "target-remove";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => removeSavedTarget(target));
    actions.append(editButton, removeButton);
    row.append(main, actions);
    container.append(row);
  }
}

async function loadTargets() {
  const button = $("#refresh-targets");
  const container = $("#targets-list");
  button.disabled = true;
  container.textContent = "Loading monitored targets…";
  try {
    const response = await listTargets();
    renderTargets(Array.isArray(response.targets) ? response.targets : []);
  } catch (error) {
    container.textContent = error instanceof AtlasApiError ? error.message : "Could not load monitored targets.";
  } finally { button.disabled = false; }
}

function loadTargetIntoForm(target) {
  measurementForm.elements.type.value = "ping";
  measurementForm.elements.af.value = String(target.af);
  measurementForm.elements.target.value = target.target;
  measurementForm.elements.description.value = `Monitored target: ${target.label}`;
  measurementForm.elements.selectionType.value = target.selectionType;
  measurementForm.elements.selectionValue.value = target.selectionValue;
  measurementForm.elements.requested.value = String(target.requested);
  measurementForm.elements.selectionType.dispatchEvent(new Event("change"));
  measurementForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function runSavedTarget(target, type, button) {
  if (!window.confirm(`Run a one-off ${type} to ${target.target} using ${target.requested} probes? RIPE Atlas credits may apply.`)) return;
  button.disabled = true;
  const message = showTargetMessage(`Creating ${type} for ${target.label}…`);
  try {
    const response = await runTarget(target.id, type);
    const measurementId = Array.isArray(response.measurements) ? response.measurements[0] : null;
    message.textContent = measurementId ? `Measurement ${measurementId} created. ` : "Measurement created. ";
    if (measurementId) {
      const link = document.createElement("a");
      link.href = `https://atlas.ripe.net/measurements/${measurementId}/`;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = "Open in RIPE Atlas ↗";
      message.append(link);
    }
    loadOwnedMeasurements();
  } catch (error) {
    showTargetMessage(error instanceof AtlasApiError ? error.message : "Could not run the target test.", true);
  } finally { button.disabled = false; }
}

async function removeSavedTarget(target) {
  if (!window.confirm(`Remove monitored target “${target.label}”?`)) return;
  try {
    await removeTarget(target.id);
    showTargetMessage(`Removed ${target.label}.`);
    loadTargets();
  } catch (error) {
    showTargetMessage(error instanceof AtlasApiError ? error.message : "Could not remove the target.", true);
  }
}

$("#target-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    await saveTarget(Object.fromEntries(new FormData(form)));
    const label = form.elements.label.value;
    form.reset();
    showTargetMessage(`Saved ${label}.`);
    loadTargets();
  } catch (error) {
    showTargetMessage(error instanceof AtlasApiError ? error.message : "Could not save the target.", true);
  } finally { button.disabled = false; }
});

$("#refresh-targets").addEventListener("click", loadTargets);

const savedProbeId = localStorage.getItem("ripe-atlas-webcockpit.probe-id");
if (savedProbeId) {
  input.value = savedProbeId;
  loadProbe(savedProbeId);
}
refreshControlStatus();
loadTargets();

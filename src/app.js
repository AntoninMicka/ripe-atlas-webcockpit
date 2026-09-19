import { AtlasApiError, clearAccessToken, createMeasurement, fetchControlStatus, fetchProbe, saveAccessToken } from "./api.js";
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
}

async function refreshControlStatus() {
  try {
    const status = await fetchControlStatus();
    setControlStatus(status.tokenConfigured, status.tokenConfigured
      ? "A measurement key is configured. Its value cannot be read back."
      : "No measurement key is configured yet.");
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

const savedProbeId = localStorage.getItem("ripe-atlas-webcockpit.probe-id");
if (savedProbeId) {
  input.value = savedProbeId;
  loadProbe(savedProbeId);
}
refreshControlStatus();

import { AtlasApiError, fetchProbe } from "./api.js";
import { normalizeProbe } from "./model.js";

const $ = (selector) => document.querySelector(selector);
const form = $("#probe-form");
const input = $("#probe-id");
const welcome = $("#welcome");
const message = $("#message");
const dashboard = $("#dashboard");

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

const savedProbeId = localStorage.getItem("ripe-atlas-webcockpit.probe-id");
if (savedProbeId) {
  input.value = savedProbeId;
  loadProbe(savedProbeId);
}

import assert from "node:assert/strict";
import test from "node:test";
import { formatAsn, formatDuration, formatTimestamp, normalizeProbe } from "../src/model.js";

test("formatDuration handles useful and missing values", () => {
  assert.equal(formatDuration(183900), "2d 3h");
  assert.equal(formatDuration(3660), "1h 1m");
  assert.equal(formatDuration(null), "Not reported");
});

test("formatAsn does not invent an autonomous system", () => {
  assert.equal(formatAsn(64500), "AS64500");
  assert.equal(formatAsn(null), "Not reported");
});

test("formatTimestamp formats a reported Unix timestamp", () => {
  const formatted = formatTimestamp(1700000000);
  assert.match(formatted, /2023/);
  assert.notEqual(formatted, "Not reported");
});

test("normalizeProbe maps a connected public probe", () => {
  const model = normalizeProbe({
    id: 123,
    status: { id: 2, name: "Connected" },
    country_code: "CZ",
    description: "Edge probe",
    is_public: true,
    address_v4: "192.0.2.4",
    prefix_v4: "192.0.2.0/24",
    asn_v4: 64500,
    tags: [{ slug: "system-ipv4-works" }, { name: "Home" }]
  });
  assert.deepEqual(model.status, { label: "Connected", tone: "good" });
  assert.equal(model.ipv4.asn, "AS64500");
  assert.deepEqual(model.tags, ["Home", "system-ipv4-works"]);
});

test("normalizeProbe prefers the API status name over a legacy numeric mapping", () => {
  const model = normalizeProbe({ id: 1000001, status: { id: 3, name: "Abandoned" } });
  assert.deepEqual(model.status, { label: "Abandoned", tone: "muted" });
});

test("normalizeProbe degrades missing optional fields explicitly", () => {
  const model = normalizeProbe({ id: 7, status: 3 });
  assert.deepEqual(model.status, { label: "Disconnected", tone: "danger" });
  assert.equal(model.ipv6.address, "Not reported");
  assert.deepEqual(model.tags, []);
});

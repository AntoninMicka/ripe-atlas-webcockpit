import assert from "node:assert/strict";
import test from "node:test";
import { AtlasApiError, createMeasurement, fetchMeasurementResults, listMeasurements, listMyProbes, listTargets, normalizeMeasurement, removeTarget, rerunMeasurement, runTarget, saveAccessToken, saveTarget } from "../src/api.js";

const valid = {
  type: "ping", target: "example.net", description: "Router test", af: "4",
  requested: "5", selectionType: "asn", selectionValue: "3333"
};

test("normalizeMeasurement accepts a bounded supported measurement", () => {
  assert.deepEqual(normalizeMeasurement(valid), { ...valid, af: 4, requested: 5 });
});

test("normalizeMeasurement rejects unsupported and unbounded requests", () => {
  assert.throws(() => normalizeMeasurement({ ...valid, type: "http" }), AtlasApiError);
  assert.throws(() => normalizeMeasurement({ ...valid, requested: 51 }), AtlasApiError);
  assert.throws(() => normalizeMeasurement({ ...valid, selectionType: "area" }), AtlasApiError);
});

test("saveAccessToken sends the key only in the same-origin POST body", async () => {
  let request;
  await saveAccessToken("12345678-1234-1234-1234-123456789abc", {
    endpoint: "/control",
    fetchImpl: async (url, init) => {
      request = { url, init };
      return { ok: true, status: 200, json: async () => ({ tokenConfigured: true }) };
    }
  });
  assert.equal(request.url, "/control");
  assert.equal(request.init.credentials, "same-origin");
  assert.deepEqual(JSON.parse(request.init.body), { action: "token.save", token: "12345678-1234-1234-1234-123456789abc" });
});

test("createMeasurement does not accept raw extra API fields", async () => {
  let body;
  await createMeasurement({ ...valid, is_oneoff: false, bill_to: "other@example.net" }, {
    fetchImpl: async (_url, init) => {
      body = JSON.parse(init.body);
      return { ok: true, status: 201, json: async () => ({ measurements: [42] }) };
    }
  });
  assert.equal(body.is_oneoff, undefined);
  assert.equal(body.bill_to, undefined);
  assert.equal(body.action, "measurement.create");
});

test("listMeasurements requests only the router-owned list action", async () => {
  let body;
  await listMeasurements({ fetchImpl: async (_url, init) => {
    body = JSON.parse(init.body);
    return { ok: true, status: 200, json: async () => ({ results: [] }) };
  } });
  assert.deepEqual(body, { action: "measurements.list" });
});

test("rerunMeasurement validates the ID before requesting a rerun", async () => {
  let body;
  await rerunMeasurement("424200", { fetchImpl: async (_url, init) => {
    body = JSON.parse(init.body);
    return { ok: true, status: 201, json: async () => ({ measurements: [424242] }) };
  } });
  assert.deepEqual(body, { action: "measurement.rerun", measurementId: 424200 });
  assert.throws(() => rerunMeasurement("../../keys", { fetchImpl: async () => assert.fail("must not fetch") }), AtlasApiError);
});

test("fetchMeasurementResults validates the ID and requests latest results", async () => {
  let body;
  await fetchMeasurementResults(424200, { fetchImpl: async (_url, init) => {
    body = JSON.parse(init.body);
    return { ok: true, status: 200, json: async () => ({ "123": [] }) };
  } });
  assert.deepEqual(body, { action: "measurement.results", measurementId: 424200 });
  assert.throws(() => fetchMeasurementResults("all"), AtlasApiError);
});

test("listMyProbes uses the allowlisted router action", async () => {
  let body;
  await listMyProbes({ fetchImpl: async (_url, init) => {
    body = JSON.parse(init.body);
    return { ok: true, status: 200, json: async () => ({ results: [] }) };
  } });
  assert.deepEqual(body, { action: "probes.list" });
});

test("saved target actions use normalized allowlisted fields", async () => {
  const requests = [];
  const options = { fetchImpl: async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return { ok: true, status: 200, json: async () => ({ targets: [] }) };
  } };
  await listTargets(options);
  await saveTarget({ label: "Primary", target: "example.net", af: 4, requested: 5, selectionType: "region", selectionValue: "europe", ignored: "nope" }, options);
  await runTarget("123456", "ping", options);
  await removeTarget("123456", options);
  assert.deepEqual(requests, [
    { action: "targets.list" },
    { action: "targets.save", label: "Primary", target: "example.net", af: 4, requested: 5, selectionType: "region", selectionValue: "europe" },
    { action: "target.run", targetId: "123456", type: "ping" },
    { action: "targets.remove", targetId: "123456" }
  ]);
});

test("saved target actions reject unsafe IDs and unsupported tests", () => {
  assert.throws(() => runTarget("../token", "ping"), AtlasApiError);
  assert.throws(() => runTarget("123", "http"), AtlasApiError);
  assert.throws(() => removeTarget("all"), AtlasApiError);
});

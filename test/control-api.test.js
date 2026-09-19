import assert from "node:assert/strict";
import test from "node:test";
import { AtlasApiError, createMeasurement, normalizeMeasurement, saveAccessToken } from "../src/api.js";

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

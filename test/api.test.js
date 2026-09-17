import assert from "node:assert/strict";
import test from "node:test";
import { AtlasApiError, fetchProbe, parseProbeId } from "../src/api.js";

test("parseProbeId accepts a positive decimal ID", () => {
  assert.equal(parseProbeId(" 12345 "), 12345);
});

test("parseProbeId rejects values that could alter the URL", () => {
  for (const value of ["", "0", "-1", "12/measurements", "1e3", "abc"]) {
    assert.throws(() => parseProbeId(value), (error) => error instanceof AtlasApiError && error.code === "invalid_probe_id");
  }
});

test("fetchProbe requests the normalized public probe URL", async () => {
  let observedUrl;
  const result = await fetchProbe("42", {
    apiBase: "https://example.test/api/v2",
    fetchImpl: async (url, init) => {
      observedUrl = url;
      assert.equal(init.headers.accept, "application/json");
      return { ok: true, status: 200, json: async () => ({ id: 42 }) };
    }
  });
  assert.equal(observedUrl, "https://example.test/api/v2/probes/42/");
  assert.deepEqual(result, { id: 42 });
});

test("fetchProbe returns a specific not-found error", async () => {
  await assert.rejects(
    fetchProbe(999, { fetchImpl: async () => ({ ok: false, status: 404 }) }),
    (error) => error.code === "not_found" && error.status === 404
  );
});

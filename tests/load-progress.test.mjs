import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function importTS(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}
const { LoadProgressTracker, formatDuration } = await importTS("../src/lib/load-progress.ts");
const { downloadModel, DownloadRate } = await importTS("../src/lib/model-download.ts");
const report = (stage, progress, extra = {}) => ({ stage, progress, text: stage, timeElapsed: 0, ...extra });

test("walks every percentage point, never regresses, and reserves 100 for readiness", () => {
  const tracker = new LoadProgressTracker(0, 100000, false);
  tracker.update(report("download", 0), 0);
  tracker.update(report("download", 1), 10000);
  const percentages = Array.from({ length: 80 }, () => Math.round(tracker.snapshot(10000).progress * 100));
  assert.deepEqual(percentages, Array.from({ length: 80 }, (_, index) => index + 1));
  tracker.update(report("upload", 0), 11000);
  assert.equal(tracker.snapshot(11000).progress, .8);
  tracker.update(report("download", .1), 12000);
  assert.equal(tracker.snapshot(12000).stage, "upload");
  tracker.update(report("compile", 1), 13000);
  for (let i = 0; i < 100; i++) assert.ok(tracker.snapshot(13000).progress < 1);
  tracker.update(report("ready", 1), 14000);
  const done = tracker.snapshot(14000);
  assert.equal(done.progress, 1);
  assert.equal(done.remainingMs, 0);
  assert.equal(done.finishAt, 114000);
});

test("estimates throughput and total, reacts to slowdowns, and withdraws stalled ETA", () => {
  const tracker = new LoadProgressTracker(0, 100000, false);
  tracker.update(report("download", 0, { totalBytes: 1000000 }), 0);
  assert.equal(tracker.snapshot(500).remainingMs, undefined);
  tracker.update(report("download", .5, { totalBytes: 1000000 }), 5000);
  const fast = tracker.snapshot(5000);
  assert.equal(fast.bytesPerSecond, 100000);
  assert.ok(fast.remainingMs > 5000);
  assert.equal(fast.totalMs, fast.elapsedMs + fast.remainingMs);
  assert.equal(fast.finishAt, 100000 + fast.totalMs);
  tracker.update(report("download", .6, { totalBytes: 1000000 }), 10000);
  const slow = tracker.snapshot(10000);
  assert.ok(slow.bytesPerSecond < fast.bytesPerSecond);
  assert.ok(slow.remainingMs > fast.remainingMs);
  const stalled = tracker.snapshot(26000);
  assert.equal(stalled.stalled, true);
  assert.equal(stalled.finishAt, undefined);
  assert.equal(stalled.remainingMs, undefined);
  tracker.update(report("download", .7), 27000);
  assert.equal(tracker.snapshot(27000).stalled, false);
});

test("cached loads and historical phase durations produce finite timing", () => {
  const tracker = new LoadProgressTracker(0, 100000, true, { upload: 10000, compile: 3000 });
  tracker.update(report("upload", 0), 1000);
  assert.equal(tracker.snapshot(1000).remainingMs, 13000);
  tracker.update(report("upload", .5), 6000);
  assert.equal(tracker.snapshot(6000).remainingMs, 8000);
  tracker.update(report("compile", .5), 12000);
  tracker.update(report("ready", 1), 14000);
  assert.deepEqual(tracker.timings(), { prepare: 1000, upload: 11000, compile: 2000 });
  assert.equal(new LoadProgressTracker(14000, 114000, true).snapshot(14000).progress, 0);
  assert.equal(formatDuration(65000), "1m 5s");
});

function mockDownload(t, { cached = [], truncated = false, httpError = false } = {}) {
  const base = "https://example.test/model/resolve/main/";
  const manifest = { records: [{ dataPath: "a.bin", nbytes: 100 }, { dataPath: "b.bin", nbytes: 100 }] };
  const stored = new Map([[`${base}tensor-cache.json`, new TextEncoder().encode(JSON.stringify(manifest))]]);
  cached.forEach((file) => stored.set(base + file, new Uint8Array(100)));
  const requested = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    requested.push(url);
    if (httpError) return new Response(null, { status: 503 });
    let count = 0;
    return new Response(new ReadableStream({ pull(controller) {
      if (count >= (truncated ? 5 : 10)) return controller.close();
      count++;
      controller.enqueue(new Uint8Array(10));
    } }));
  });
  const old = Object.getOwnPropertyDescriptor(globalThis, "caches");
  Object.defineProperty(globalThis, "caches", { configurable: true, value: { open: async () => ({
    match: async (url) => stored.has(url) ? new Response(stored.get(url)) : undefined,
    keys: async () => [...stored.keys()].map((url) => ({ url })),
    put: async (url, response) => { const data = await response.arrayBuffer(); stored.set(url, new Uint8Array(data)); },
  }) } });
  t.after(() => old ? Object.defineProperty(globalThis, "caches", old) : delete globalThis.caches);
  return { base, stored, requested };
}

test("measures chunks across concurrent downloads and reuses cache", async (t) => {
  const { base, stored, requested } = mockDownload(t);
  const reports = [];
  await downloadModel("https://example.test/model", (value) => reports.push(value));
  assert.equal(requested.length, 2);
  assert.equal(stored.get(`${base}a.bin`).length, 100);
  assert.equal(stored.get(`${base}b.bin`).length, 100);
  assert.ok(reports.some((value) => value.loadedBytes > 0 && value.loadedBytes < 100));
  assert.equal(reports.at(-1).loadedBytes, 200);
  assert.equal(reports.at(-1).progress, 1);
  assert.deepEqual(reports.at(-1).download.files.map((file) => file.status), ["complete", "complete"]);
  assert.equal(reports.at(-1).download.complete, true);
  assert.equal(reports[0].download.files[0].loadedBytes, 0, "Earlier snapshots must not mutate");
  const cachedReports = [];
  await downloadModel("https://example.test/model", (value) => cachedReports.push(value));
  assert.equal(cachedReports.at(-1).download.totalBytes, 0);
  assert.equal(cachedReports.at(-1).download.cachedBytes, 200);
  assert.equal(cachedReports.at(-1).download.bytesPerSecond, 0);
  assert.deepEqual(cachedReports.at(-1).download.files.map((file) => file.status), ["cached", "cached"]);
  assert.equal(requested.length, 2);
});

test("partial cache counts only remaining network bytes", async (t) => {
  const { requested } = mockDownload(t, { cached: ["a.bin"] });
  const reports = [];
  await downloadModel("https://example.test/model", (value) => reports.push(value));
  assert.equal(requested.length, 1);
  assert.ok(requested[0].endsWith("b.bin"));
  assert.equal(reports.at(-1).totalBytes, 100);
  assert.equal(reports.at(-1).download.cachedBytes, 100);
  assert.deepEqual(reports.at(-1).download.files.map((file) => file.status), ["cached", "complete"]);
});

test("truncated and failed responses never enter the weight cache", async (t) => {
  const { stored } = mockDownload(t, { truncated: true });
  await assert.rejects(downloadModel("https://example.test/model", () => {}), /Incomplete model file/);
  assert.equal(stored.size, 1);
});

test("HTTP failures reject loading", async (t) => {
  const { stored } = mockDownload(t, { httpError: true });
  const reports = [];
  await assert.rejects(downloadModel("https://example.test/model", (value) => reports.push(value)), /503/);
  assert.equal(reports.at(-1).download.complete, false);
  assert.ok(reports.at(-1).download.files.some((file) => file.status === "error"));
  assert.equal(stored.size, 1);
});

test("rolling throughput falls to zero while stalled and recovers", () => {
  const rate = new DownloadRate(0);
  assert.equal(rate.measure(100, 100000), 0);
  assert.equal(rate.measure(1000, 1000000), 1000000);
  assert.equal(rate.measure(2000, 2000000), 1000000);
  for (let time = 2250; time <= 7000; time += 250) rate.measure(time, 2000000);
  assert.equal(rate.measure(7250, 2000000), 0);
  assert.ok(rate.measure(7500, 3000000) > 0);
});

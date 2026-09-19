import type { LoadReport } from "./load-progress";

type Shard = { dataPath: string; nbytes: number };

// The same cache namespace and URL normalization used by WebLLM's Cache API
// backend. Prefilling it lets the runtime reuse files without a second download.
export async function downloadModel(modelUrl: string, report: (value: LoadReport) => void) {
  let base = modelUrl.endsWith("/") ? modelUrl : `${modelUrl}/`;
  if (!base.match(/.+\/resolve\/.+\//)) base += "resolve/main/";
  const cache = await caches.open("webllm/model");
  const manifestUrl = new URL("tensor-cache.json", base).href;
  let manifestResponse = await cache.match(manifestUrl);
  if (!manifestResponse) {
    manifestResponse = await fetch(manifestUrl);
    if (!manifestResponse.ok) throw new Error(`Model manifest request failed (${manifestResponse.status}).`);
    await cache.put(manifestUrl, manifestResponse.clone());
  }
  const manifest: { records: Shard[] } = await manifestResponse.json();
  if (!Array.isArray(manifest.records) || !manifest.records.length || manifest.records.some((shard) =>
    typeof shard.dataPath !== "string" || !Number.isSafeInteger(shard.nbytes) || shard.nbytes <= 0)) {
    throw new Error("The model file manifest is invalid.");
  }
  const keys = new Set((await cache.keys()).map((key) => key.url));
  const missing = manifest.records.filter((shard) => !keys.has(new URL(shard.dataPath, base).href));
  const totalBytes = missing.reduce((sum, shard) => sum + shard.nbytes, 0);
  if (totalBytes === 0) return;
  const counts = new Map<string, number>();
  let loadedBytes = 0;
  let lastPercent = -1;
  let lastReport = 0;
  const started = performance.now();
  const emit = (force = false) => {
    const now = performance.now();
    const percent = Math.floor(loadedBytes / totalBytes * 100);
    if (!force && percent === lastPercent && now - lastReport < 100) return;
    lastPercent = percent;
    lastReport = now;
    report({ stage: "download", progress: loadedBytes / totalBytes, text: "Downloading model weights",
      timeElapsed: (now - started) / 1000, loadedBytes, totalBytes });
  };
  emit(true);
  const controller = new AbortController();
  let next = 0;
  const fetchNext = async () => {
    while (next < missing.length) {
      const shard = missing[next++];
      const url = new URL(shard.dataPath, base).href;
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok || !response.body) throw new Error(`Model file request failed (${response.status}).`);
      let count = 0;
      const stream = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, writer) {
          count += chunk.byteLength;
          const previous = counts.get(url) ?? 0;
          counts.set(url, Math.min(count, shard.nbytes));
          loadedBytes += Math.min(count, shard.nbytes) - previous;
          emit();
          writer.enqueue(chunk);
        },
        flush() {
          if (count !== shard.nbytes) throw new Error(`Incomplete model file: ${shard.dataPath}. Please retry loading.`);
        },
      }));
      // Backpressure keeps memory bounded; no full-model buffers or clone/tee.
      await cache.put(url, new Response(stream, { status: response.status, statusText: response.statusText, headers: response.headers }));
    }
  };
  const tasks = Array.from({ length: Math.min(4, missing.length) }, () => fetchNext());
  try {
    await Promise.all(tasks);
    emit(true);
  } catch (error) {
    controller.abort();
    await Promise.allSettled(tasks);
    throw error;
  }
}

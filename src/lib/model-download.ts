import type { LoadReport } from "./load-progress";

type Shard = { dataPath: string; nbytes: number };

export type DownloadFile = {
  name: string;
  url: string;
  totalBytes: number;
  loadedBytes: number;
  status: "queued" | "downloading" | "saving" | "complete" | "cached" | "error" | "cancelled";
};
export type DownloadDetails = {
  source: string;
  files: DownloadFile[];
  loadedBytes: number;
  totalBytes: number;
  cachedBytes: number;
  bytesPerSecond: number;
  elapsedMs: number;
  remainingMs?: number;
  complete: boolean;
};
export type DownloadJob = {
  model: string;
  status: "preparing" | "downloading" | "complete" | "error" | "cancelled";
  details?: DownloadDetails;
  error?: string;
};

// Sample even without chunks, so a stalled connection falls to zero throughput.
export class DownloadRate {
  private samples: { at: number; bytes: number }[];
  constructor(start: number) { this.samples = [{ at: start, bytes: 0 }]; }
  measure(now: number, bytes: number) {
    this.samples.push({ at: now, bytes });
    while (this.samples.length > 2 && this.samples[1].at <= now - 5000) this.samples.shift();
    const first = this.samples[0];
    return now - first.at < 500 ? 0 : Math.max(0, (bytes - first.bytes) * 1000 / (now - first.at));
  }
}

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
  const files: DownloadFile[] = manifest.records.map((shard) => {
    const url = new URL(shard.dataPath, base).href;
    const cached = keys.has(url);
    return { name: shard.dataPath, url, totalBytes: shard.nbytes, loadedBytes: cached ? shard.nbytes : 0, status: cached ? "cached" : "queued" };
  });
  const fileByUrl = new Map(files.map((file) => [file.url, file]));
  const cachedBytes = files.filter((file) => file.status === "cached").reduce((sum, file) => sum + file.totalBytes, 0);
  const counts = new Map<string, number>();
  let loadedBytes = 0;
  let lastPercent = -1;
  let lastReport = 0;
  const started = performance.now();
  const rate = new DownloadRate(started);
  let complete = totalBytes === 0;
  const emit = (force = false) => {
    const now = performance.now();
    const percent = totalBytes ? Math.floor(loadedBytes / totalBytes * 100) : 100;
    if (!force && percent === lastPercent && now - lastReport < 100) return;
    lastPercent = percent;
    lastReport = now;
    const measuredRate = rate.measure(now, loadedBytes);
    const bytesPerSecond = complete ? 0 : measuredRate;
    report({ stage: totalBytes ? "download" : "prepare", progress: totalBytes ? loadedBytes / totalBytes : 0, text: complete ? "Model weights cached" : "Downloading model weights",
      timeElapsed: (now - started) / 1000, loadedBytes, totalBytes,
      download: { source: base, files: files.map((file) => ({ ...file })), loadedBytes, totalBytes, cachedBytes, bytesPerSecond,
        elapsedMs: now - started, remainingMs: complete ? 0 : bytesPerSecond > 0 ? (totalBytes - loadedBytes) / bytesPerSecond * 1000 : undefined, complete },
    });
  };
  emit(true);
  if (complete) return;
  const controller = new AbortController();
  const heartbeat = setInterval(() => emit(true), 250);
  let next = 0;
  const fetchNext = async () => {
    while (!controller.signal.aborted && next < missing.length) {
      const shard = missing[next++];
      const url = new URL(shard.dataPath, base).href;
      const file = fileByUrl.get(url)!;
      file.status = "downloading";
      emit(true);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok || !response.body) throw new Error(`Model file request failed (${response.status}).`);
        let count = 0;
        const stream = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, writer) {
            count += chunk.byteLength;
            const previous = counts.get(url) ?? 0;
            counts.set(url, Math.min(count, shard.nbytes));
            loadedBytes += Math.min(count, shard.nbytes) - previous;
            file.loadedBytes = Math.min(count, shard.nbytes);
            emit();
            writer.enqueue(chunk);
          },
          flush() {
            if (count !== shard.nbytes) throw new Error(`Incomplete model file: ${shard.dataPath}. Please retry loading.`);
            file.status = "saving";
          },
        }));
        // Backpressure keeps memory bounded; no full-model buffers or clone/tee.
        await cache.put(url, new Response(stream, { status: response.status, statusText: response.statusText, headers: response.headers }));
        file.status = "complete";
        emit(true);
      } catch (error) {
        file.status = controller.signal.aborted ? "cancelled" : "error";
        throw error;
      }
    }
  };
  const tasks = Array.from({ length: Math.min(4, missing.length) }, () => fetchNext());
  try {
    await Promise.all(tasks);
    complete = true;
    emit(true);
  } catch (error) {
    controller.abort();
    await Promise.allSettled(tasks);
    files.forEach((file) => { if (file.status === "queued") file.status = "cancelled"; });
    emit(true);
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
}

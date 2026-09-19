export type LoadStage = "prepare" | "download" | "upload" | "compile" | "ready";
export type LoadReport = {
  stage: LoadStage;
  progress: number;
  text: string;
  timeElapsed: number;
  loadedBytes?: number;
  totalBytes?: number;
};
export type LoadSnapshot = {
  progress: number;
  text: string;
  stage: LoadStage;
  elapsedMs: number;
  remainingMs?: number;
  totalMs?: number;
  finishAt?: number;
  bytesPerSecond?: number;
  loadedBytes?: number;
  totalBytes?: number;
  stalled: boolean;
};
type Timings = Partial<Record<LoadStage, number>>;
const stages: LoadStage[] = ["prepare", "download", "upload", "compile", "ready"];

// Fractions describe estimated work across phases; each phase's input is measured.
// Never extrapolate the bar with time or allow a phase reset to move it backwards.
export class LoadProgressTracker {
  private stage: LoadStage = "prepare";
  private fraction = 0;
  private stageStart: number;
  private lastAdvance: number;
  private samples: { at: number; fraction: number }[] = [];
  private target = 0;
  private shown = 0;
  private report: LoadReport;
  private durations: Timings = {};
  private weights: number[];

  constructor(private start: number, private wallStart: number, cached: boolean, private history: Timings = {}) {
    this.stageStart = this.lastAdvance = start;
    this.weights = cached ? [3, 0, 77, 19] : [2, 78, 15, 4];
    this.report = { stage: "prepare", progress: 0, text: "Checking model files…", timeElapsed: 0 };
  }

  update(report: LoadReport, now: number) {
    const index = stages.indexOf(report.stage);
    if (index < stages.indexOf(this.stage)) return;
    if (report.stage !== this.stage) {
      // Cache status can change between the UI check and the actual load.
      if (report.stage === "download") this.weights = [2, 78, 15, 4];
      if (report.stage === "upload" && this.stage === "prepare") this.weights = [3, 0, 77, 19];
      this.durations[this.stage] = now - this.stageStart;
      this.stage = report.stage;
      this.stageStart = this.lastAdvance = now;
      this.fraction = 0;
      this.samples = [{ at: now, fraction: 0 }];
    }
    const fraction = Number.isFinite(report.progress) ? Math.min(1, Math.max(0, report.progress)) : this.fraction;
    if (fraction > this.fraction) {
      this.lastAdvance = now;
      this.samples.push({ at: now, fraction });
      // A rolling 12-second window adapts to speed changes without noisy chunk ETAs.
      while (this.samples.length > 2 && this.samples[1].at < now - 12000) this.samples.shift();
    }
    this.fraction = Math.max(this.fraction, fraction);
    this.report = report;
    const before = this.weights.slice(0, index).reduce((a, b) => a + b, 0);
    this.target = Math.max(this.target, Math.min(99, Math.floor(before + (this.weights[index] ?? 0) * this.fraction)));
    if (report.stage === "ready") this.target = this.shown = 100;
  }

  snapshot(now: number): LoadSnapshot {
    // Walk every integer towards measured progress, including coarse GPU callbacks.
    if (this.shown < this.target) this.shown++;
    const elapsedMs = Math.max(0, now - this.start);
    const stalled = this.stage !== "ready" && now - this.lastAdvance > 15000;
    const stageElapsed = Math.max(0, now - this.stageStart);
    const first = this.samples[0];
    const rate = first && now - first.at >= 1000
      ? (this.fraction - first.fraction) / (now - first.at) : 0;
    let remainingMs: number | undefined;
    if (this.stage === "ready") remainingMs = 0;
    else if (!stalled) {
      const historic = this.history[this.stage];
      const stageTotal = rate > 0 ? stageElapsed + (1 - this.fraction) / rate : historic;
      if (stageTotal != null && stageTotal > stageElapsed) {
        const index = stages.indexOf(this.stage);
        const weight = this.weights[index] || 1;
        const future = stages.slice(index + 1, 4).reduce((sum, stage, offset) =>
          sum + (this.history[stage] ?? stageTotal * this.weights[index + offset + 1] / weight), 0);
        remainingMs = Math.max(1000, stageTotal - stageElapsed + future);
      } else if (rate > 0 && this.fraction === 1) {
        const index = stages.indexOf(this.stage);
        remainingMs = Math.max(1000, stages.slice(index + 1, 4).reduce((sum, stage, offset) =>
          sum + (this.history[stage] ?? stageElapsed * this.weights[index + offset + 1] / (this.weights[index] || 1)), 0));
      }
    }
    const totalMs = remainingMs == null ? undefined : elapsedMs + remainingMs;
    return {
      progress: this.shown / 100, stage: this.stage, text: this.report.text,
      elapsedMs, remainingMs, totalMs, finishAt: totalMs == null ? undefined : this.wallStart + totalMs,
      loadedBytes: this.report.loadedBytes, totalBytes: this.report.totalBytes,
      bytesPerSecond: this.stage === "download" && rate > 0 && this.report.totalBytes
        ? rate * this.report.totalBytes * 1000 : undefined,
      stalled,
    };
  }

  timings(): Timings { return this.durations; }
}

export function readLoadHistory(key: string): Timings {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "{}");
    return Object.fromEntries(Object.entries(value).filter(([stage, ms]) =>
      stages.includes(stage as LoadStage) && typeof ms === "number" && Number.isFinite(ms) && ms > 0 && ms < 86400000));
  } catch { return {}; }
}

export function formatDuration(ms?: number) {
  if (ms == null || !Number.isFinite(ms)) return "Estimating…";
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`;
}

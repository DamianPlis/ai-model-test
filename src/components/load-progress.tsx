import { Progress } from "@/components/ui/progress";
import { formatDuration, type LoadSnapshot } from "@/lib/load-progress";

export function LoadProgress({ value, compact = false }: { value: LoadSnapshot; compact?: boolean }) {
  const percent = Math.round(value.progress * 100);
  const done = value.stage === "ready";
  const stage = { prepare: "Checking files", download: "Downloading weights", upload: "Loading GPU", compile: "Compiling shaders", ready: "Ready" }[value.stage];
  return (
    <section className={`load-progress-panel${compact ? " compact" : ""}`} aria-label="Model loading status">
      <div className="load-progress-heading">
        <span title={value.text}>{stage}</span>
        <strong>{percent}%</strong>
      </div>
      <Progress value={percent} aria-label="Overall model loading progress" aria-valuetext={`${percent}%, ${stage}`} className="h-1.5" />
      <dl className="load-progress-metrics">
        <div><dt>Elapsed</dt><dd>{formatDuration(value.elapsedMs)}</dd></div>
        <div><dt>Time remaining</dt><dd>{value.stalled ? "Re-estimating…" : formatDuration(value.remainingMs)}</dd></div>
        <div><dt>{done ? "Total time" : "Estimated total"}</dt><dd>{formatDuration(value.totalMs)}</dd></div>
        <div><dt>{done ? "Finished at" : "Expected finish"}</dt><dd>{value.finishAt == null ? "Estimating…" : new Date(value.finishAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</dd></div>
      </dl>
      {value.totalBytes != null && (
        <p className="load-transfer">{((value.loadedBytes ?? 0) / 1e6).toFixed(2)} MB / {(value.totalBytes / 1e6).toFixed(2)} MB
          {value.bytesPerSecond != null && <> · {(value.bytesPerSecond / 1e6).toFixed(2)} MB/s · {(value.bytesPerSecond * 8 / 1e6).toFixed(2)} Mbps</>}
        </p>
      )}
      <p className="load-estimate-note">{done ? "Model loaded and ready to use." : value.stalled ? "Waiting for loading activity. Timing will update when progress resumes." : "Overall progress and timing are estimates based on loading activity."}</p>
    </section>
  );
}

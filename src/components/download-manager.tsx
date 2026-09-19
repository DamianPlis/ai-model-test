import { Check, Download, FileDown, HardDrive, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { formatDuration } from "@/lib/load-progress";
import { shortModel } from "@/lib/types";
import type { Playground } from "@/hooks/use-playground";

// Network units are decimal: one megabyte = eight megabits.
export const transferSize = (bytes: number) => bytes >= 1e9 ? `${(bytes / 1e9).toFixed(2)} GB` : `${(bytes / 1e6).toFixed(2)} MB`;

export function DownloadManager({ p, open, onOpenChange }: { p: Playground; open: boolean; onOpenChange: (open: boolean) => void }) {
  const job = p.download;
  const data = job?.details;
  const active = job?.status === "downloading";
  const stopped = job?.status === "cancelled" || job?.status === "error";
  const speed = active ? data?.bytesPerSecond ?? 0 : 0;
  const percent = data ? data.totalBytes ? Math.min(100, data.loadedBytes / data.totalBytes * 100) : 100 : 0;
  const completed = data?.files.filter((file) => file.status === "complete" || file.status === "cached").length ?? 0;
  const status = job ? { preparing: "Checking files", downloading: "Downloading", complete: "Download complete", error: "Download failed", cancelled: "Cancelled" }[job.status] : "No downloads yet";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="download-dialog">
        <DialogHeader>
          <DialogTitle className="download-title"><Download size={20} /> Download manager</DialogTitle>
          <DialogDescription>Model weight downloads · saved in this browser for reuse.</DialogDescription>
        </DialogHeader>
        {!job ? (
          <div className="download-empty"><HardDrive size={32} strokeWidth={1.3} /><strong>No downloads yet</strong><p>Load a model to see its files, transfer speed, and progress here.</p></div>
        ) : (
          <>
            <div className="download-model">
              <div><span className="eyebrow">LATEST MODEL DOWNLOAD</span><h2 title={job.model}>{shortModel(job.model)}</h2><p>{job.model}</p></div>
              <span className={`download-status ${job.status}`} role="status">{job.status === "complete" && <Check size={13} />}{status}</span>
            </div>
            <div className="download-overview">
              <div className="download-speed"><span>Transfer speed</span><strong>{(speed / 1e6).toFixed(2)} <small>MB/s</small></strong><p>{(speed * 8 / 1e6).toFixed(2)} <span>Mbps</span></p></div>
              <dl className="download-metrics">
                <div><dt>Downloaded</dt><dd>{data ? transferSize(data.loadedBytes) : "—"}</dd></div>
                <div><dt>Remaining</dt><dd>{data ? transferSize(Math.max(0, data.totalBytes - data.loadedBytes)) : "—"}</dd></div>
                <div><dt>Elapsed</dt><dd>{data ? formatDuration(data.elapsedMs) : "—"}</dd></div>
                <div><dt>Download ETA</dt><dd>{stopped ? "—" : data?.complete ? "Done" : formatDuration(data?.remainingMs)}</dd></div>
              </dl>
              <div className="download-total"><span>{data ? `${transferSize(data.loadedBytes)} / ${transferSize(data.totalBytes)} to transfer` : "Reading the model file manifest…"}</span><strong>{percent.toFixed(1)}%</strong></div>
              <Progress value={percent} aria-label="Model weight download progress" />
            </div>
            {job.error && <p className="download-error" role="alert">{job.error}</p>}
            {data && <>
              <div className="download-files-heading"><strong>Model files <span>{completed} / {data.files.length} saved</span></strong><span>{transferSize(data.cachedBytes)} reused from cache</span></div>
              <ul className="download-files" aria-label="Model files">
                {data.files.map((file) => {
                  const fileStatus = stopped && ["queued", "downloading", "saving"].includes(file.status) ? "cancelled" : file.status;
                  const filePercent = file.loadedBytes / file.totalBytes * 100;
                  return <li key={file.url}>
                    <FileDown size={17} />
                    <div className="download-file-main"><div><strong title={file.url}>{file.name}</strong><span>{fileStatus === "complete" ? "Saved" : fileStatus === "cached" ? "Cached" : fileStatus === "saving" ? "Saving…" : fileStatus === "downloading" ? `${filePercent.toFixed(1)}%` : fileStatus === "error" ? "Failed" : fileStatus === "cancelled" ? "Cancelled" : "Queued"}</span></div>
                      <Progress value={filePercent} aria-label={`${file.name} download progress`} />
                      <small>{transferSize(file.loadedBytes)} / {transferSize(file.totalBytes)}</small>
                    </div>
                  </li>;
                })}
              </ul>
              <p className="download-source">Source: <span title={data.source}>{data.source}</span></p>
            </>}
            <div className="download-bottom">
              <p>{stopped ? "Saved files are kept. Retry downloads the remaining files." : data?.complete ? p.phase === "loading" ? "Weights saved. The model is now being prepared on your GPU." : "Weights are saved in the browser cache." : "Speed uses a rolling 5-second average. 1 MB/s = 8 Mbps."}</p>
              {p.phase === "loading" && <Button size="sm" variant="outline" onClick={p.cancelLoad}><X size={14} />{data?.complete ? "Cancel loading" : "Cancel"}</Button>}
              {stopped && <Button size="sm" disabled={p.phase === "loading" || p.phase === "generating" || !p.hardware.webgpu} onClick={() => void p.load(job.model)}><RotateCcw size={14} />Retry</Button>}
            </div>
            <p className="download-scope">Tracks model weights. Runtime, tokenizer, and configuration requests are handled separately.</p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

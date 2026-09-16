import { useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  Check,
  ChevronDown,
  Copy,
  Cpu,
  HardDrive,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Terminal,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Playground } from "@/hooks/use-playground";
import {
  defaults,
  formatBytes,
  formatTime,
  shortModel,
  type Run,
  type Settings,
} from "@/lib/types";

function SettingSlider({
  name,
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
  disabled,
}: {
  name: string;
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="setting">
      <div className="setting-top">
        <Tooltip>
          <TooltipTrigger asChild>
            <label htmlFor={name}>{label}</label>
          </TooltipTrigger>
          <TooltipContent>{hint}</TooltipContent>
        </Tooltip>
        <Input
          id={name}
          aria-label={label}
          className="number-input"
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            if (e.target.value !== "")
              onChange(Math.max(min, Math.min(max, Number(e.target.value))));
          }}
        />
      </div>
      <Slider
        aria-label={`${label} slider`}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(v) => onChange(v[0])}
        disabled={disabled}
      />
      <div className="range-ends">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="metric-row">
      <span>{label}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="metric-value">{value}</span>
        </TooltipTrigger>
        <TooltipContent>{hint ?? label}</TooltipContent>
      </Tooltip>
    </div>
  );
}
function CopyData({ value, p }: { value: unknown; p: Playground }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Copy JSON"
      className="small-icon"
      onClick={() => {
        void navigator.clipboard
          .writeText(JSON.stringify(value, null, 2))
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          })
          .catch(() =>
            p.log("warn", "Clipboard unavailable. Use Export instead."),
          );
      }}
    >
      {copied ? <Check /> : <Copy />}
    </Button>
  );
}
export function Inspector({ p }: { p: Playground }) {
  const { settings, setSettings } = p;
  const locked = p.phase === "generating" || p.phase === "loading";
  const [selectedRun, setSelectedRun] = useState("latest");
  const [logFilter, setLogFilter] = useState("all");
  const run: Run | undefined =
    selectedRun === "latest"
      ? p.runs.at(-1)
      : (p.runs.find((r) => r.id === selectedRun) ?? p.runs.at(-1));
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((old) => ({ ...old, [key]: value }));
  const rate = (value?: number) =>
    value == null ? "—" : `${value.toFixed(1)} tok/s`;
  return (
    <div className="inspector-inner">
      <div className="inspector-heading">
        <div>
          <SlidersHorizontal size={16} />
          <h2>Inspector</h2>
        </div>
        <span className="eyebrow">PLAYGROUND</span>
      </div>
      <Tabs defaultValue="controls" className="inspector-tabs">
        <TabsList className="inspector-tab-list">
          <TabsTrigger value="controls">
            <SlidersHorizontal />
            Controls
          </TabsTrigger>
          <TabsTrigger value="runtime">
            <Activity />
            Runtime
          </TabsTrigger>
          <TabsTrigger value="logs">
            <Terminal />
            Logs
            {p.logs.some((l) => l.level === "error") && (
              <span className="error-dot" />
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="controls" className="panel-scroll">
          <section className="panel-section">
            <div className="section-heading">
              <h3>Generation</h3>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Reset all settings"
                    disabled={locked}
                    onClick={() => setSettings({ ...defaults })}
                    className="small-icon"
                  >
                    <RotateCcw />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reset all settings to defaults</TooltipContent>
              </Tooltip>
            </div>
            <SettingSlider
              name="temperature"
              label="Temperature"
              hint="Higher values make the output more varied. Zero uses greedy decoding."
              value={settings.temperature}
              min={0}
              max={2}
              step={0.05}
              onChange={(v) => set("temperature", v)}
              disabled={locked}
            />
            <SettingSlider
              name="top-p"
              label="Top P"
              hint="Samples from tokens whose combined probability reaches this threshold."
              value={settings.top_p}
              min={0.05}
              max={1}
              step={0.05}
              onChange={(v) => set("top_p", v)}
              disabled={locked}
            />
            <SettingSlider
              name="max-tokens"
              label="Max output tokens"
              hint="Limits reply length. Input and output must fit inside the loaded context."
              value={settings.max_tokens}
              min={16}
              max={2048}
              step={16}
              onChange={(v) => set("max_tokens", v)}
              disabled={locked}
            />
            <div className="toggle-row">
              <div>
                <label htmlFor="stream">Stream response</label>
                <p>Show text as it arrives</p>
              </div>
              <Switch
                id="stream"
                checked={settings.stream}
                onCheckedChange={(v) => set("stream", v)}
                disabled={locked}
              />
            </div>
          </section>
          <section className="panel-section">
            <div className="section-heading">
              <label htmlFor="system-prompt">System prompt</label>
              <span className="micro-label">OPTIONAL</span>
            </div>
            <Textarea
              id="system-prompt"
              className="system-prompt"
              value={settings.system}
              onChange={(e) => set("system", e.target.value)}
              disabled={locked}
              placeholder="Give the model instructions…"
            />
            <p className="field-note">
              Applied to the next message. Small models may not follow every
              instruction.
            </p>
          </section>
          <section className="panel-section">
            <details className="advanced">
              <summary>
                Advanced parameters
                <ChevronDown size={15} />
              </summary>
              <div className="advanced-body">
                <SettingSlider
                  name="frequency"
                  label="Frequency penalty"
                  hint="Positive values discourage frequently repeated tokens."
                  value={settings.frequency_penalty}
                  min={-2}
                  max={2}
                  step={0.1}
                  onChange={(v) => set("frequency_penalty", v)}
                  disabled={locked}
                />
                <SettingSlider
                  name="presence"
                  label="Presence penalty"
                  hint="Positive values discourage tokens already present in the output."
                  value={settings.presence_penalty}
                  min={-2}
                  max={2}
                  step={0.1}
                  onChange={(v) => set("presence_penalty", v)}
                  disabled={locked}
                />
                <label className="field-label" htmlFor="seed">
                  Seed
                </label>
                <Input
                  id="seed"
                  inputMode="numeric"
                  placeholder="Random"
                  value={settings.seed}
                  onChange={(e) => set("seed", e.target.value)}
                  disabled={locked}
                />
                <p className="field-note">
                  Useful for repeatable comparisons; hardware can still affect
                  results.
                </p>
                <label className="field-label" htmlFor="stops">
                  Stop sequences
                </label>
                <Input
                  id="stops"
                  className="mono"
                  placeholder={'["END", "###"]'}
                  value={settings.stop}
                  onChange={(e) => set("stop", e.target.value)}
                  disabled={locked}
                />
                <p className="field-note">
                  A JSON array of strings. Leave empty for model defaults.
                </p>
                <div className="toggle-row">
                  <div>
                    <label htmlFor="json">JSON object mode</label>
                    <p>Constrain the output format</p>
                  </div>
                  <Switch
                    id="json"
                    checked={settings.json}
                    onCheckedChange={(v) => set("json", v)}
                    disabled={locked}
                  />
                </div>
              </div>
            </details>
          </section>
          <section className="panel-section">
            <div className="section-heading">
              <h3>Model allocation</h3>
              <Cpu size={15} />
            </div>
            <label className="field-label" htmlFor="context">
              Context window
            </label>
            <Select
              value={String(settings.context)}
              onValueChange={(v) => set("context", Number(v))}
              disabled={locked}
            >
              <SelectTrigger id="context" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1024, 2048, 4096, 8192].map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size.toLocaleString()} tokens
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="field-note">
              Smaller context uses less memory. Changes apply when you load or
              reload the model.
            </p>
            {p.activeContext && settings.context !== p.activeContext && (
              <p className="pending-note">
                Pending reload · currently {p.activeContext.toLocaleString()}
              </p>
            )}
          </section>
        </TabsContent>
        <TabsContent value="runtime" className="panel-scroll">
          <section className="panel-section">
            <div className="section-heading">
              <h3>Inference</h3>
              <span className="micro-label">{p.runs.length} RUNS</span>
            </div>
            <Select value={selectedRun} onValueChange={setSelectedRun}>
              <SelectTrigger aria-label="Inspect run" className="w-full mb-4">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="latest">Latest run</SelectItem>
                {p.runs.toReversed().map((r, i) => (
                  <SelectItem key={r.id} value={r.id}>
                    Run {p.runs.length - i} ·{" "}
                    {new Date(r.startedAt).toLocaleTimeString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="runtime-hero">
              <span>Decode speed</span>
              <strong>
                {run?.decodeRate?.toFixed(1) ?? "—"}
                <small>tok/s</small>
              </strong>
              <div
                className="mini-bars"
                aria-label="Decode speeds of recent runs"
              >
                {p.runs.slice(-24).map((r) => (
                  <span
                    key={r.id}
                    title={`${r.decodeRate?.toFixed(1) ?? "Unavailable"} tok/s`}
                    style={{
                      height: `${r.decodeRate ? Math.max(4, (r.decodeRate / Math.max(...p.runs.map((item) => item.decodeRate ?? 1))) * 34) : 2}px`,
                    }}
                  />
                ))}
              </div>
            </div>
            <Metric
              label="Time to first text"
              value={formatTime(run?.firstChunkMs)}
              hint="Wall time to the first nonempty stream chunk. Includes prompt processing. Unavailable without streaming."
            />
            <Metric
              label="Total request time"
              value={formatTime(run?.elapsedMs)}
            />
            <Metric
              label="Prompt tokens"
              value={run?.inputTokens?.toLocaleString() ?? "—"}
            />
            <Metric
              label="Output tokens"
              value={run?.outputTokens?.toLocaleString() ?? "—"}
            />
            <Metric label="Prefill speed" value={rate(run?.prefillRate)} />
            <Metric
              label="Prefill time"
              value={
                run?.prefillSeconds == null
                  ? "—"
                  : formatTime(run.prefillSeconds * 1000)
              }
            />
            <Metric
              label="Decode time"
              value={
                run?.decodeSeconds == null
                  ? "—"
                  : formatTime(run.decodeSeconds * 1000)
              }
            />
            <Metric
              label="Finish reason"
              value={
                run?.error
                  ? "error"
                  : run?.stopped
                    ? "interrupted"
                    : (run?.finishReason ?? "—")
              }
            />
            <Metric label="Model load time" value={formatTime(p.loadMs)} />
            {run && (
              <p className="field-note break-all">
                Run model: {shortModel(run.model)}
              </p>
            )}
            <p className="field-note">
              Token counts and speeds come from WebLLM. A dash means the runtime
              hasn’t reported that metric.
            </p>
          </section>
          <section className="panel-section">
            <div className="section-heading">
              <h3>Device & browser</h3>
              <Button
                variant="ghost"
                size="icon"
                className="small-icon"
                aria-label="Refresh device stats"
                onClick={() => void p.refreshHardware()}
              >
                <RefreshCw />
              </Button>
            </div>
            <div className="device-name">
              <Cpu size={17} />
              <span>{p.hardware.adapter ?? "No GPU adapter"}</span>
            </div>
            <Metric
              label="GPU preference"
              value="High performance"
              hint="Requested for both model inference and device detection. The browser chooses the adapter."
            />
            <Metric
              label="WebGPU"
              value={p.hardware.webgpu ? "Available" : "Unavailable"}
            />
            <Metric
              label="Secure context"
              value={p.hardware.secure ? "Yes" : "No"}
            />
            <Metric
              label="Shader f16"
              value={
                p.hardware.features.includes("shader-f16")
                  ? "Supported"
                  : "Unavailable"
              }
            />
            <Metric label="CPU logical cores" value={p.hardware.cores || "—"} />
            <Metric
              label="Device RAM (coarse)"
              value={
                p.hardware.deviceMemory
                  ? `${p.hardware.deviceMemory} GB`
                  : "Unavailable"
              }
            />
            <Metric
              label="Max GPU buffer"
              value={formatBytes(p.hardware.maxBuffer)}
              hint="A per-buffer adapter limit, not available VRAM."
            />
            <Metric
              label="Max storage binding"
              value={formatBytes(p.hardware.maxStorageBuffer)}
            />
            <Metric
              label="JS heap used"
              value={formatBytes(p.hardware.heapUsed)}
              hint="Main-thread JavaScript heap only. Excludes worker, WASM, and GPU memory."
            />
            <Metric
              label="JS heap limit"
              value={formatBytes(p.hardware.heapLimit)}
            />
            <Metric
              label="Network"
              value={p.hardware.online ? "Online" : "Offline"}
            />
            <p className="field-note">
              Browsers don’t expose reliable total GPU memory, temperature, or
              power usage. JS heap is not total model memory.
            </p>
            <details className="raw-details">
              <summary>
                Adapter features
                <ChevronDown size={14} />
              </summary>
              <pre>
                {p.hardware.features.join("\n") || "No features reported."}
              </pre>
            </details>
          </section>
          <section className="panel-section">
            <div className="section-heading">
              <h3>Storage</h3>
              <HardDrive size={15} />
            </div>
            <Metric
              label="Origin storage used"
              value={formatBytes(p.hardware.storageUsed)}
            />
            <Metric
              label="Origin storage quota"
              value={formatBytes(p.hardware.storageQuota)}
            />
            <Metric
              label="Persistent storage"
              value={
                p.hardware.persistent == null
                  ? "Unavailable"
                  : p.hardware.persistent
                    ? "Granted"
                    : "Not granted"
              }
            />
            <p className="field-note">
              Storage includes all data for this origin. Cached files can be
              evicted by the browser.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.storage
                  ?.persist()
                  .then((value) => {
                    p.log(
                      "info",
                      value
                        ? "Persistent storage granted."
                        : "Browser did not grant persistent storage.",
                    );
                    void p.refreshHardware();
                  })
                  .catch((error) => p.log("warn", String(error)));
              }}
            >
              Request persistent storage
            </Button>
          </section>
          <section className="panel-section">
            <details className="raw-details">
              <summary>
                Runtime summary
                <ChevronDown size={14} />
              </summary>
              <pre>{p.runtimeStats}</pre>
            </details>
            {run && (
              <>
                <details className="raw-details">
                  <summary>
                    Request JSON
                    <ChevronDown size={14} />
                  </summary>
                  <div className="raw-toolbar">
                    <CopyData value={run.request} p={p} />
                  </div>
                  <pre>{JSON.stringify(run.request, null, 2)}</pre>
                </details>
                <details className="raw-details">
                  <summary>
                    Run JSON
                    <ChevronDown size={14} />
                  </summary>
                  <div className="raw-toolbar">
                    <CopyData value={run} p={p} />
                  </div>
                  <pre>{JSON.stringify(run, null, 2)}</pre>
                </details>
              </>
            )}
            <Button
              variant="outline"
              className="w-full mt-4"
              onClick={() => p.exportData("diagnostics")}
            >
              <ArrowDownToLine />
              Export diagnostics
            </Button>
            <p className="field-note">
              Export includes prompts, responses, settings, and device details.
            </p>
          </section>
        </TabsContent>
        <TabsContent value="logs" className="panel-scroll">
          <section className="panel-section">
            <div className="section-heading">
              <h3>Event log</h3>
              <Button
                variant="ghost"
                size="icon"
                className="small-icon"
                aria-label="Clear event log"
                onClick={p.clearLogs}
              >
                <Trash2 />
              </Button>
            </div>
            <Select value={logFilter} onValueChange={setLogFilter}>
              <SelectTrigger aria-label="Filter logs" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All events</SelectItem>
                <SelectItem value="error">Errors only</SelectItem>
                <SelectItem value="warn">Warnings only</SelectItem>
              </SelectContent>
            </Select>
            <div className="logs">
              {p.logs
                .filter((l) => logFilter === "all" || l.level === logFilter)
                .toReversed()
                .map((entry) => (
                  <div className={`log-entry ${entry.level}`} key={entry.id}>
                    <div>
                      <span>{entry.level.toUpperCase()}</span>
                      <time>{new Date(entry.at).toLocaleTimeString()}</time>
                    </div>
                    <p>{entry.text}</p>
                  </div>
                ))}
              {!p.logs.some(
                (l) => logFilter === "all" || l.level === logFilter,
              ) && (
                <div className="log-empty">
                  <Terminal size={24} />
                  <p>No events to show.</p>
                </div>
              )}
            </div>
          </section>
        </TabsContent>
      </Tabs>
      <div className="inspector-foot">
        <span className="status-dot" />
        Inference stays on this device
      </div>
    </div>
  );
}

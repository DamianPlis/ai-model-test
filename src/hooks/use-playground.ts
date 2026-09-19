import { useCallback, useEffect, useRef, useState } from "react";
import {
  WebWorkerMLCEngine,
  prebuiltAppConfig,
  hasModelInCache,
  deleteModelAllInfoInCache,
} from "@mlc-ai/web-llm";
import type {
  ChatCompletionMessageParam,
  ChatCompletionRequest,
  CompletionUsage,
} from "@mlc-ai/web-llm";
import {
  defaults,
  type ChatMessage,
  type Hardware,
  type LogEntry,
  type Phase,
  type Run,
  type Settings,
} from "@/lib/types";
import { inspectHardware, refreshMemory } from "@/lib/hardware";
import { LoadProgressTracker, readLoadHistory, type LoadReport } from "@/lib/load-progress";

export const models = prebuiltAppConfig.model_list.filter(
  (model) => !/embed|snowflake|bge-/i.test(model.model_id),
);
const initialModel =
  models.find((m) => m.model_id === "SmolLM2-360M-Instruct-q4f16_1-MLC")
    ?.model_id ?? models[0].model_id;
const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
function initialSettings(): Settings {
  try {
    const saved = JSON.parse(
      localStorage.getItem("local-lab-settings") ?? "null",
    );
    if (!saved || typeof saved !== "object") return defaults;
    const settings = { ...defaults };
    for (const key of Object.keys(defaults) as (keyof Settings)[]) {
      if (typeof saved[key] === typeof defaults[key])
        Object.assign(settings, { [key]: saved[key] });
    }
    return settings;
  } catch {
    return defaults;
  }
}

export function usePlayground() {
  const [selectedModel, setSelectedModel] = useState(initialModel);
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const loadTracker = useRef(new LoadProgressTracker(0, 0, false));
  const [progress, setProgress] = useState(() => loadTracker.current.snapshot(0));
  const [loadMs, setLoadMs] = useState<number>();
  const [activeContext, setActiveContext] = useState<number>();
  const [cached, setCached] = useState<boolean | undefined>();
  const [elapsed, setElapsed] = useState(0);
  const [runtimeStats, setRuntimeStats] = useState("No completed run yet.");
  const [hardware, setHardware] = useState<Hardware>({
    checked: false,
    webgpu: false,
    secure: true,
    features: [],
    cores: 0,
    online: true,
    userAgent: "",
  });
  const engine = useRef<WebWorkerMLCEngine | null>(null);
  const worker = useRef<Worker | null>(null);
  const busy = useRef(false);
  const operation = useRef(0);
  const stopRequested = useRef(false);
  const started = useRef(0);
  const abortLoad = useRef<(() => void) | null>(null);
  const log = useCallback(
    (level: LogEntry["level"], text: string) =>
      setLogs((prev) => [
        ...prev.slice(-199),
        { id: crypto.randomUUID(), at: new Date().toISOString(), level, text },
      ]),
    [],
  );

  useEffect(() => {
    try {
      localStorage.setItem("local-lab-settings", JSON.stringify(settings));
    } catch {
      /* Settings still work without storage. */
    }
  }, [settings]);
  useEffect(() => {
    let disposed = false;
    void inspectHardware().then((value) => {
      if (!disposed) {
        setHardware(value);
        log(
          value.webgpu ? "success" : "warn",
          value.webgpu
            ? `WebGPU available: ${value.adapter}`
            : (value.error ?? "WebGPU unavailable"),
        );
      }
    });
    const onError = (event: ErrorEvent) =>
      log("error", `Browser: ${event.message}`);
    const onRejection = (event: PromiseRejectionEvent) =>
      log("error", `Unhandled promise: ${messageOf(event.reason)}`);
    const onNetwork = () => {
      setHardware((h) => ({ ...h, online: navigator.onLine }));
      log(
        "info",
        navigator.onLine
          ? "Network connected."
          : "Network disconnected. Cached model assets may still work.",
      );
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("online", onNetwork);
    window.addEventListener("offline", onNetwork);
    return () => {
      disposed = true;
      operation.current++;
      abortLoad.current?.();
      worker.current?.terminate();
      worker.current = null;
      engine.current = null;
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("online", onNetwork);
      window.removeEventListener("offline", onNetwork);
    };
  }, [log]);
  useEffect(() => {
    let disposed = false;
    setCached(undefined);
    void hasModelInCache(selectedModel)
      .then((value) => {
        if (!disposed) setCached(value);
      })
      .catch(() => {
        if (!disposed) setCached(undefined);
      });
    return () => {
      disposed = true;
    };
  }, [selectedModel, phase]);
  useEffect(() => {
    if (phase !== "loading" && phase !== "generating") return;
    const interval = setInterval(
      () => setElapsed(performance.now() - started.current),
      100,
    );
    return () => clearInterval(interval);
  }, [phase]);
  useEffect(() => {
    if (phase !== "loading") return;
    const timer = setInterval(() => setProgress(loadTracker.current.snapshot(performance.now())), 32);
    return () => clearInterval(timer);
  }, [phase]);

  const refreshHardware = async () => setHardware(await inspectHardware());
  const dispose = () => {
    worker.current?.terminate();
    worker.current = null;
    engine.current = null;
    setActiveModel(null);
    setActiveContext(undefined);
  };
  const cancelLoad = () => {
    operation.current++;
    abortLoad.current?.();
    abortLoad.current = null;
    dispose();
    busy.current = false;
    setPhase("idle");
    loadTracker.current = new LoadProgressTracker(0, 0, false);
    setProgress(loadTracker.current.snapshot(0));
    log(
      "warn",
      "Loading cancelled; worker terminated. Previously cached files are retained.",
    );
  };
  const load = async () => {
    if (busy.current) return;
    if (!hardware.webgpu) {
      setError(hardware.error ?? "WebGPU is not available in this browser.");
      return;
    }
    busy.current = true;
    const ticket = ++operation.current;
    dispose();
    setError(null);
    setPhase("loading");
    setLoadMs(undefined);
    setElapsed(0);
    started.current = performance.now();
    const historyKey = `local-lab-load-v1:${selectedModel}:${settings.context}:${cached === true ? "cached" : "download"}`;
    loadTracker.current = new LoadProgressTracker(started.current, Date.now(), cached === true, readLoadHistory(historyKey));
    setProgress(loadTracker.current.snapshot(started.current));
    log(
      "info",
      `Loading ${selectedModel}; context ${settings.context}; worker backend.`,
    );
    try {
      const nextWorker = new Worker(
        new URL("../lib/webllm.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.current = nextWorker;
      const cancelled = new Promise<never>((_, reject) => {
        abortLoad.current = () => reject(new Error("Loading cancelled."));
        nextWorker.onerror = (event) =>
          reject(new Error(event.message || "Model worker failed."));
      });
      const nextEngine = new WebWorkerMLCEngine(nextWorker, {
        initProgressCallback: (report) => {
          if (ticket === operation.current && "stage" in report) {
            loadTracker.current.update(report as LoadReport, performance.now());
          }
        },
      });
      engine.current = nextEngine;
      await Promise.race([
        nextEngine.reload(selectedModel, {
          context_window_size: settings.context,
        }),
        cancelled,
      ]);
      if (ticket !== operation.current) return;
      const duration = performance.now() - started.current;
      loadTracker.current.update({ stage: "ready", progress: 1, text: "Model ready", timeElapsed: duration / 1000 }, performance.now());
      setProgress(loadTracker.current.snapshot(performance.now()));
      try {
        const previous = readLoadHistory(historyKey);
        const timings = Object.fromEntries(Object.entries(loadTracker.current.timings()).map(([stage, ms]) =>
          [stage, previous[stage as keyof typeof previous] == null ? ms : 0.65 * ms + 0.35 * previous[stage as keyof typeof previous]!]));
        localStorage.setItem(historyKey, JSON.stringify(timings));
      } catch { /* Estimates work without persisted history. */ }
      setLoadMs(duration);
      setActiveModel(selectedModel);
      setActiveContext(settings.context);
      setPhase("ready");
      nextWorker.onerror = (event) => {
        operation.current++;
        busy.current = false;
        dispose();
        setPhase("error");
        const message =
          event.message || "Model worker failed. Reload the model to recover.";
        setError(message);
        log("error", message);
      };
      log(
        "success",
        `Model ready in ${(duration / 1000).toFixed(2)} s. Context: ${settings.context} tokens.`,
      );
      setHardware((h) => ({ ...h }));
      void refreshMemory(hardware).then(setHardware);
    } catch (cause) {
      if (ticket !== operation.current) return;
      const message = messageOf(cause);
      setError(message);
      log("error", `Model load failed: ${message}`);
      dispose();
      setPhase("error");
    } finally {
      if (ticket === operation.current) {
        busy.current = false;
        abortLoad.current = null;
      }
    }
  };
  const unload = () => {
    if (busy.current) return;
    dispose();
    setPhase("idle");
    setError(null);
    log(
      "info",
      "Model unloaded; GPU resources released. Download cache retained.",
    );
  };
  const clearCache = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      if (activeModel === selectedModel) {
        dispose();
        setPhase("idle");
      }
      await deleteModelAllInfoInCache(selectedModel);
      setCached(false);
      log("success", `Removed cached artifacts for ${selectedModel}.`);
      setHardware(await refreshMemory(hardware));
    } catch (cause) {
      setError(messageOf(cause));
      log("error", `Cache removal failed: ${messageOf(cause)}`);
    } finally {
      busy.current = false;
    }
  };
  const stop = () => {
    if (phase !== "generating") return;
    stopRequested.current = true;
    engine.current?.interruptGenerate();
    log(
      "warn",
      "Stop requested. Waiting for the current generation step to finish.",
    );
  };
  const clear = () => {
    if (busy.current) return;
    setMessages([]);
    setError(null);
    log("info", "Conversation cleared. Run history retained for comparison.");
  };
  const generate = async (history: ChatMessage[]) => {
    if (busy.current || !engine.current || !activeModel) return;
    let stops: string[] = [];
    try {
      stops = settings.stop.trim() ? JSON.parse(settings.stop) : [];
      if (
        !Array.isArray(stops) ||
        stops.some((s) => typeof s !== "string" || !s)
      )
        throw new Error(
          'Stop sequences must be a JSON array of nonempty strings, e.g. ["END"].',
        );
    } catch (cause) {
      setError(messageOf(cause));
      return;
    }
    if (settings.seed.trim() && !/^-?\d+$/.test(settings.seed.trim())) {
      setError("Seed must be an integer or left empty.");
      return;
    }
    if (settings.max_tokens >= (activeContext ?? settings.context)) {
      setError(
        "Max output tokens must be smaller than the loaded context window.",
      );
      return;
    }
    const prepared: ChatCompletionMessageParam[] = [];
    const system =
      settings.system +
      (settings.json ? "\nRespond with a valid JSON object." : "");
    if (system.trim()) prepared.push({ role: "system", content: system });
    for (const item of history)
      if (item.content)
        prepared.push({ role: item.role, content: item.content });
    const request: ChatCompletionRequest = {
      messages: prepared,
      temperature: settings.temperature,
      top_p: settings.top_p,
      max_tokens: settings.max_tokens,
      frequency_penalty: settings.frequency_penalty,
      presence_penalty: settings.presence_penalty,
      ...(settings.seed.trim() ? { seed: Number(settings.seed) } : {}),
      ...(stops.length ? { stop: stops } : {}),
      ...(settings.json
        ? { response_format: { type: "json_object" as const } }
        : {}),
    };
    const id = crypto.randomUUID();
    const ticket = ++operation.current;
    const currentEngine = engine.current;
    const model = activeModel;
    const start = performance.now();
    started.current = start;
    stopRequested.current = false;
    busy.current = true;
    setElapsed(0);
    setPhase("generating");
    setError(null);
    setMessages([...history, { id, role: "assistant", content: "", model }]);
    log(
      "info",
      `Generation started: ${history.length} messages, max ${settings.max_tokens} tokens, temperature ${settings.temperature}.`,
    );
    let output = "",
      firstChunkMs: number | undefined,
      usage: CompletionUsage | undefined,
      finishReason: string | undefined,
      failure: string | undefined;
    let lastPaint = 0;
    const paint = () => {
      if (ticket === operation.current)
        setMessages((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, content: output } : item,
          ),
        );
    };
    try {
      if (settings.stream) {
        const stream = await currentEngine.chat.completions.create({
          ...request,
          stream: true,
          stream_options: { include_usage: true },
        });
        for await (const chunk of stream) {
          if (ticket !== operation.current) break;
          const text = chunk.choices[0]?.delta.content ?? "";
          if (text && firstChunkMs == null)
            firstChunkMs = performance.now() - start;
          output += text;
          if (chunk.usage) usage = chunk.usage;
          if (chunk.choices[0]?.finish_reason)
            finishReason = chunk.choices[0].finish_reason;
          if (performance.now() - lastPaint > 40) {
            paint();
            lastPaint = performance.now();
          }
        }
      } else {
        const result = await currentEngine.chat.completions.create({
          ...request,
          stream: false,
        });
        output = result.choices[0]?.message.content ?? "";
        usage = result.usage;
        finishReason = result.choices[0]?.finish_reason ?? undefined;
      }
      if (ticket !== operation.current) return;
      paint();
      try {
        setRuntimeStats(await currentEngine.runtimeStatsText());
      } catch {
        setRuntimeStats("Runtime summary unavailable.");
      }
    } catch (cause) {
      failure = messageOf(cause);
      if (ticket === operation.current) {
        setError(failure);
        log("error", `Generation failed: ${failure}`);
      }
    } finally {
      if (ticket === operation.current) {
        const extra = usage?.extra as
          | {
              prefill_tokens_per_s?: number;
              decode_tokens_per_s?: number;
              prefill_time?: number;
              decode_time?: number;
            }
          | undefined;
        const run: Run = {
          id,
          model,
          startedAt: new Date(
            Date.now() - (performance.now() - start),
          ).toISOString(),
          elapsedMs: performance.now() - start,
          firstChunkMs,
          inputTokens: usage?.prompt_tokens,
          outputTokens: usage?.completion_tokens,
          prefillRate: extra?.prefill_tokens_per_s,
          decodeRate: extra?.decode_tokens_per_s,
          prefillSeconds: extra?.prefill_time,
          decodeSeconds: extra?.decode_time,
          finishReason,
          stopped: stopRequested.current,
          error: failure,
          request: { ...request, stream: settings.stream },
          output,
        };
        setRuns((prev) => [...prev.slice(-49), run]);
        setMessages((prev) =>
          prev.map((item) =>
            item.id === id
              ? {
                  ...item,
                  content: output,
                  incomplete: !!failure || stopRequested.current,
                }
              : item,
          ),
        );
        setPhase("ready");
        busy.current = false;
        if (!failure)
          log(
            stopRequested.current ? "warn" : "success",
            `${stopRequested.current ? "Stopped" : "Completed"} in ${(run.elapsedMs / 1000).toFixed(2)} s · ${usage?.completion_tokens ?? "?"} output tokens · finish: ${finishReason ?? "unknown"}`,
          );
        void refreshMemory(hardware).then(setHardware);
      }
    }
  };
  const send = (text: string) => {
    if (text.trim())
      return generate([
        ...messages.filter((m) => m.content),
        { id: crypto.randomUUID(), role: "user", content: text.trim() },
      ]);
  };
  const regenerate = () => {
    const index = messages.findLastIndex((m) => m.role === "user");
    if (index >= 0) return generate(messages.slice(0, index + 1));
  };
  const editLast = () => {
    if (busy.current) return "";
    const index = messages.findLastIndex((m) => m.role === "user");
    if (index < 0) return "";
    const text = messages[index].content;
    setMessages(messages.slice(0, index));
    return text;
  };
  const exportData = (kind: "chat" | "diagnostics") => {
    const value =
      kind === "chat"
        ? { exportedAt: new Date().toISOString(), messages }
        : {
            exportedAt: new Date().toISOString(),
            hardware,
            settings,
            activeModel,
            activeContext,
            loadMs,
            runtimeStats,
            runs,
            logs,
          };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `local-lab-${kind}-${Date.now()}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    log(
      "info",
      `Exported ${kind}${kind === "diagnostics" ? " (includes prompts and responses)" : ""}.`,
    );
  };
  return {
    selectedModel,
    setSelectedModel,
    activeModel,
    phase,
    settings,
    setSettings,
    messages,
    runs,
    logs,
    error,
    setError,
    progress,
    loadMs,
    activeContext,
    cached,
    elapsed,
    runtimeStats,
    hardware,
    refreshHardware,
    load,
    cancelLoad,
    unload,
    clearCache,
    stop,
    clear,
    send,
    regenerate,
    editLast,
    exportData,
    clearLogs: () => setLogs([]),
    log,
  };
}
export type Playground = ReturnType<typeof usePlayground>;

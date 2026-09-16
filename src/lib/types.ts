export type Phase = "idle" | "loading" | "ready" | "generating" | "error";
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  incomplete?: boolean;
};
export type Settings = {
  temperature: number;
  top_p: number;
  max_tokens: number;
  frequency_penalty: number;
  presence_penalty: number;
  seed: string;
  stop: string;
  system: string;
  stream: boolean;
  json: boolean;
  context: number;
};
export const defaults: Settings = {
  temperature: 0.7,
  top_p: 0.9,
  max_tokens: 256,
  frequency_penalty: 0,
  presence_penalty: 0,
  seed: "",
  stop: "",
  system: "You are a helpful, concise assistant. Answer directly and clearly.",
  stream: true,
  json: false,
  context: 2048,
};
export type Run = {
  id: string;
  model: string;
  startedAt: string;
  elapsedMs: number;
  firstChunkMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  prefillRate?: number;
  decodeRate?: number;
  prefillSeconds?: number;
  decodeSeconds?: number;
  finishReason?: string;
  stopped: boolean;
  error?: string;
  request: unknown;
  output: string;
};
export type LogEntry = {
  id: string;
  at: string;
  level: "info" | "success" | "warn" | "error";
  text: string;
};
export type Hardware = {
  checked: boolean;
  webgpu: boolean;
  secure: boolean;
  adapter?: string;
  features: string[];
  maxBuffer?: number;
  maxStorageBuffer?: number;
  maxWorkgroup?: number;
  cores: number;
  deviceMemory?: number;
  heapUsed?: number;
  heapLimit?: number;
  storageUsed?: number;
  storageQuota?: number;
  persistent?: boolean;
  online: boolean;
  userAgent: string;
  error?: string;
};
export function formatBytes(bytes?: number) {
  if (bytes == null) return "Unavailable";
  if (bytes === 0) return "0 MB";
  return bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(2)} GB`
    : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
export function formatTime(ms?: number) {
  return ms == null
    ? "—"
    : ms < 1000
      ? `${Math.round(ms)} ms`
      : `${(ms / 1000).toFixed(2)} s`;
}
export function shortModel(id: string) {
  return id.replace(/-MLC.*$/, "").replace(/-q[\w]+$/, "");
}

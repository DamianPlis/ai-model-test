import type { Hardware } from "./types";

type Adapter = {
  info?: {
    vendor?: string;
    architecture?: string;
    device?: string;
    description?: string;
  };
  features: Set<string>;
  limits: {
    maxBufferSize: number;
    maxStorageBufferBindingSize: number;
    maxComputeWorkgroupSizeX: number;
  };
};
type ExtendedNavigator = Navigator & {
  gpu?: {
    requestAdapter: (options: {
      powerPreference: "high-performance";
    }) => Promise<Adapter | null>;
  };
  deviceMemory?: number;
};

export async function inspectHardware(): Promise<Hardware> {
  const nav = navigator as ExtendedNavigator;
  const result: Hardware = {
    checked: true,
    webgpu: false,
    secure: isSecureContext,
    features: [],
    cores: navigator.hardwareConcurrency,
    deviceMemory: nav.deviceMemory,
    online: navigator.onLine,
    userAgent: navigator.userAgent,
  };
  try {
    // Match WebLLM's detectGPUDevice preference; the browser default may
    // select integrated graphics even when inference uses the discrete GPU.
    const adapter = await nav.gpu?.requestAdapter({
      powerPreference: "high-performance",
    });
    if (adapter) {
      result.webgpu = true;
      result.adapter =
        [
          adapter.info?.vendor,
          adapter.info?.architecture,
          adapter.info?.description,
        ]
          .filter(Boolean)
          .join(" · ") || "Available (identity hidden by browser)";
      result.features = Array.from(adapter.features);
      result.maxBuffer = adapter.limits.maxBufferSize;
      result.maxStorageBuffer = adapter.limits.maxStorageBufferBindingSize;
      result.maxWorkgroup = adapter.limits.maxComputeWorkgroupSizeX;
    } else
      result.error = isSecureContext
        ? "No WebGPU adapter available. Try a supported browser or enable hardware acceleration."
        : "WebGPU requires HTTPS or localhost. A plain HTTP address on your phone will not work.";
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }
  return refreshMemory(result);
}
export async function refreshMemory(hardware: Hardware): Promise<Hardware> {
  const memory = (
    performance as Performance & {
      memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
    }
  ).memory;
  let storage: StorageEstimate = {};
  let persistent: boolean | undefined;
  try {
    storage = (await navigator.storage?.estimate()) ?? {};
    persistent = await navigator.storage?.persisted();
  } catch {
    /* Optional browser capability. */
  }
  return {
    ...hardware,
    online: navigator.onLine,
    heapUsed: memory?.usedJSHeapSize,
    heapLimit: memory?.jsHeapSizeLimit,
    storageUsed: storage.usage,
    storageQuota: storage.quota,
    persistent,
  };
}

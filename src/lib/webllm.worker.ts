import { WebWorkerMLCEngineHandler, prebuiltAppConfig } from "@mlc-ai/web-llm";
import { downloadModel } from "./model-download";
import type { LoadReport } from "./load-progress";

const handler = new WebWorkerMLCEngineHandler();
const report = (content: LoadReport) => handler.postMessage({ kind: "initProgressCallback", uuid: "", content });
handler.engine.setInitProgressCallback((value) => {
  const stage = value.text.startsWith("Loading GPU shader") ? "compile"
    : value.text.startsWith("Loading model from cache") || value.text.startsWith("Fetching param cache") ? "upload"
    : value.text.startsWith("Finish loading") ? "compile" : "prepare";
  report({ ...value, stage });
});
self.onmessage = (event: MessageEvent) => {
  if (event.data.kind === "reload") {
    const { modelId, chatOpts } = event.data.content;
    void handler.handleTask(event.data.uuid, async () => {
      const model = prebuiltAppConfig.model_list.find((entry) => entry.model_id === modelId[0]);
      if (model) await downloadModel(model.model, report);
      report({ stage: "upload", progress: 0, text: "Preparing runtime and loading weights onto GPU…", timeElapsed: 0 });
      await handler.engine.reload(modelId, chatOpts);
      handler.modelId = modelId;
      handler.chatOpts = chatOpts;
      return null;
    });
    return;
  }
  void handler.onmessage(event);
};

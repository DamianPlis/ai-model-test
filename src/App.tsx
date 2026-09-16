import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowRight,
  ArrowUp,
  Box,
  Check,
  ChevronDown,
  CircleHelp,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  FlaskConical,
  HardDrive,
  LoaderCircle,
  Menu,
  Moon,
  Sun,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Terminal,
  Trash2,
  Unplug,
  X,
  Zap,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Inspector } from "@/components/inspector";
import { models, usePlayground, type Playground } from "@/hooks/use-playground";
import { formatTime, shortModel } from "@/lib/types";
import { cn } from "@/lib/utils";

const suggestions = [
  {
    icon: MessageSquare,
    title: "Start simple",
    text: "Explain what a language model is in three short sentences.",
  },
  {
    icon: Pencil,
    title: "Try a rewrite",
    text: "Rewrite this to sound friendly and professional: hey, can you send me that thing we talked about yesterday?",
  },
  {
    icon: Terminal,
    title: "Test instructions",
    text: "Classify each item as fruit or vegetable. Respond with a JSON object only: apple, carrot, banana.",
  },
];
function useWide() {
  const [wide, setWide] = useState(window.innerWidth >= 1180);
  useEffect(() => {
    const query = matchMedia("(min-width: 1180px)");
    const change = () => setWide(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  return wide;
}
function TipButton({
  label,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
function ModelPicker({
  p,
  open,
  setOpen,
}: {
  p: Playground;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const [smallOnly, setSmallOnly] = useState(true);
  const filtered = models.filter(
    (m) =>
      (!smallOnly || (m.vram_required_MB ?? Infinity) < 2200) &&
      m.model_id.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="model-dialog">
        <DialogHeader>
          <DialogTitle>Choose a model</DialogTitle>
          <DialogDescription>
            WebLLM’s built-in catalog. Smaller models are a good starting point
            for mobile.
          </DialogDescription>
        </DialogHeader>
        <div className="model-search">
          <Search size={17} />
          <Input
            aria-label="Search models"
            placeholder="Search SmolLM, Qwen, Llama…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="catalog-filter">
          <Button
            size="sm"
            variant={smallOnly ? "secondary" : "ghost"}
            onClick={() => setSmallOnly(true)}
          >
            Under 2.2 GB
          </Button>
          <Button
            size="sm"
            variant={!smallOnly ? "secondary" : "ghost"}
            onClick={() => setSmallOnly(false)}
          >
            All models
          </Button>
          <span>{filtered.length} models</span>
        </div>
        <div className="model-results">
          {filtered.map((m) => (
            <button
              className={cn(
                "model-option",
                p.selectedModel === m.model_id && "selected",
              )}
              key={m.model_id}
              onClick={() => {
                p.setSelectedModel(m.model_id);
                setOpen(false);
              }}
            >
              <div className="model-option-icon">
                <Box size={18} />
              </div>
              <div>
                <strong>{shortModel(m.model_id)}</strong>
                <span>{m.model_id}</span>
                <small>
                  {m.vram_required_MB == null
                    ? "Memory estimate unavailable"
                    : `~${(m.vram_required_MB / 1000).toFixed(2)} GB estimated GPU memory`}
                  {m.required_features?.includes("shader-f16")
                    ? " · f16 required"
                    : ""}
                </small>
              </div>
              {p.selectedModel === m.model_id && <Check size={17} />}
            </button>
          ))}
          {!filtered.length && (
            <p className="empty-search">
              No matching models. Try the full catalog.
            </p>
          )}
        </div>
        <p className="field-note">
          Memory estimates come from the catalog’s default configuration, not
          live measurements or download sizes. Large models may exceed your
          device’s limits.
        </p>
      </DialogContent>
    </Dialog>
  );
}
function Sidebar({
  p,
  onPick,
  onClose,
}: {
  p: Playground;
  onPick: () => void;
  onClose?: () => void;
}) {
  const [confirmCache, setConfirmCache] = useState(false);
  const record = models.find((m) => m.model_id === p.selectedModel);
  const busy = p.phase === "generating" || p.phase === "loading";
  const loaded = p.activeModel === p.selectedModel;
  return (
    <div className="sidebar-inner">
      <div className="brand">
        <div className="brand-mark">
          <FlaskConical size={21} strokeWidth={1.8} />
        </div>
        <span>
          local<span className="brand-light">lab</span>
          <span className="brand-period">.</span>
        </span>
        {onClose && (
          <TipButton
            label="Close navigation"
            onClick={onClose}
            className="ml-auto"
          >
            <X />
          </TipButton>
        )}
      </div>
      <div className="workspace-label">
        YOUR WORKSPACE<Badge variant="outline">LOCAL</Badge>
      </div>
      <Button
        className="new-chat"
        variant="outline"
        onClick={() => {
          p.clear();
          onClose?.();
        }}
        disabled={busy}
      >
        <Plus size={17} />
        New conversation<span className="key-hint">↗</span>
      </Button>
      <button className="nav-chat" onClick={onClose}>
        <MessageSquare size={17} />
        <span>Chat playground</span>
        <span className="nav-count">
          {p.messages.filter((m) => m.role === "user").length}
        </span>
      </button>
      <div className="sidebar-model">
        <div className="section-heading">
          <span className="eyebrow">MODEL</span>
          <Cpu size={15} />
        </div>
        <button className="model-selector" onClick={onPick} disabled={busy}>
          <div className="model-box">
            <Box size={21} />
          </div>
          <div>
            <strong>{shortModel(p.selectedModel)}</strong>
            <span>
              {p.selectedModel.match(/q\df\d+(?:_\d)?/)?.[0] ??
                "Default precision"}
            </span>
          </div>
          <ChevronDown size={15} />
        </button>
        <div className="model-facts">
          <span>
            <HardDrive size={13} />
            {record?.vram_required_MB
              ? `~${(record.vram_required_MB / 1000).toFixed(2)} GB GPU estimate`
              : "Memory estimate unavailable"}
          </span>
          <span>
            <Download size={13} />
            {p.cached === true
              ? "Model weights cached"
              : p.cached === false
                ? "Download on first load"
                : "Checking cache…"}
          </span>
        </div>
        {p.phase === "loading" ? (
          <>
            <Button
              className="load-button"
              variant="secondary"
              onClick={p.cancelLoad}
            >
              <X size={16} />
              Cancel loading
            </Button>
            <Progress
              value={p.progress.progress * 100}
              className="mt-3 h-1.5"
            />
            <div className="loading-caption">
              <span>{Math.round(p.progress.progress * 100)}%</span>
              <span>{formatTime(p.elapsed)}</span>
            </div>
          </>
        ) : (
          <Button
            className="load-button"
            onClick={() => void p.load()}
            disabled={busy || !p.hardware.webgpu}
          >
            <Zap size={16} />
            {loaded ? "Reload model" : "Load model"}
          </Button>
        )}
        {p.activeModel && (
          <Button
            variant="ghost"
            size="sm"
            className="unload-button"
            onClick={p.unload}
            disabled={busy}
          >
            <Unplug size={14} />
            Unload from memory
          </Button>
        )}
        <p className="model-explainer">
          Model files download to your browser. Your messages stay on your
          device.
        </p>
        <Button
          variant="ghost"
          className="cache-button"
          size="sm"
          onClick={() => setConfirmCache(true)}
          disabled={busy || !p.cached}
        >
          <Trash2 size={13} />
          Remove cached model
        </Button>
      </div>
      <div className="sidebar-bottom">
        <div className="local-note">
          <ShieldCheck size={18} />
          <div>
            <strong>No API key. No inference bill.</strong>
            <p>Powered by your own hardware.</p>
          </div>
        </div>
        <a
          className="docs-link"
          href="https://webllm.mlc.ai/docs/"
          target="_blank"
          rel="noreferrer"
        >
          <CircleHelp size={15} />
          WebLLM documentation
          <ExternalLink size={12} />
        </a>
      </div>
      <Dialog open={confirmCache} onOpenChange={setConfirmCache}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this model’s cache?</DialogTitle>
            <DialogDescription>
              The selected model will need to download again next time. If it is
              currently loaded, it will also be unloaded.
            </DialogDescription>
          </DialogHeader>
          <p className="mono text-sm break-all">{p.selectedModel}</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmCache(false)}>
              Keep cache
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                void p.clearCache();
                setConfirmCache(false);
              }}
            >
              Remove cache
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
export default function App() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#111318" : "#f7f8fa");
  }, [dark]);
  function toggleTheme() {
    const next = !dark;
    setDark(next);
    try { localStorage.setItem("local-lab-theme", next ? "dark" : "light"); } catch { /* Theme still works when storage is unavailable. */ }
  }
  const p = usePlayground();
  const [draft, setDraft] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [desktopInspector, setDesktopInspector] = useState(true);
  const [copied, setCopied] = useState<string>();
  const [nearBottom, setNearBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wide = useWide();
  const generating = p.phase === "generating";
  const busy = generating || p.phase === "loading";
  const last = p.runs.at(-1);
  const ready = p.phase === "ready" || generating;
  const status =
    p.phase === "loading"
      ? "Loading model"
      : generating
        ? "Generating"
        : ready
          ? "Model ready"
          : p.phase === "error"
            ? "Load failed"
            : "No model loaded";
  const scrollDown = () => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
    setNearBottom(true);
  };
  useEffect(() => {
    if (nearBottom && scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [p.messages, nearBottom]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape" && generating) p.stop();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [generating, p]);
  const submit = () => {
    if (!draft.trim() || p.phase !== "ready") return;
    const text = draft;
    setDraft("");
    void p.send(text);
  };
  const copy = (id: string, text: string) => {
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(id);
        setTimeout(() => setCopied(undefined), 1600);
      })
      .catch(() =>
        p.log("warn", "Clipboard unavailable. Use chat export instead."),
      );
  };
  return (
    <TooltipProvider delayDuration={250}>
      <div
        className={cn(
          "app-shell",
          wide && desktopInspector && "with-inspector",
        )}
      >
        <aside className="desktop-sidebar">
          <Sidebar p={p} onPick={() => setPickerOpen(true)} />
        </aside>
        <main className="main-area">
          <header className="topbar">
            <div className="topbar-title">
              <TipButton
                label="Open navigation"
                className="mobile-menu"
                onClick={() => setNavOpen(true)}
              >
                <Menu />
              </TipButton>
              <span className="breadcrumb">Playground</span>
              <span className="breadcrumb-slash">/</span>
              <h1>Chat</h1>
              <Badge className="version-badge" variant="secondary">
                BETA
              </Badge>
            </div>
            <div className="topbar-actions">
              <TipButton label={dark ? "Switch to light mode" : "Switch to dark mode"} onClick={toggleTheme}>
                {dark ? <Sun /> : <Moon />}
              </TipButton>
              <span className="local-header">
                <ShieldCheck size={14} />
                On-device
              </span>
              <div className="header-divider" />
              <TipButton
                label="Export conversation"
                onClick={() => p.exportData("chat")}
                disabled={!p.messages.length}
              >
                <ArrowDownToLine />
              </TipButton>
              <TipButton
                label={
                  wide && desktopInspector ? "Hide inspector" : "Open inspector"
                }
                onClick={() =>
                  wide ? setDesktopInspector((v) => !v) : setInspectorOpen(true)
                }
                className={cn(
                  (wide ? desktopInspector : inspectorOpen) && "active-icon",
                )}
              >
                {wide && desktopInspector ? (
                  <PanelRightClose />
                ) : (
                  <PanelRightOpen />
                )}
              </TipButton>
            </div>
          </header>
          <div className="session-bar">
            <div className="session-model">
              <span
                className={cn(
                  "status-dot",
                  ready && "ready",
                  busy && "pulsing",
                  p.phase === "error" && "failed",
                )}
              />
              <span>
                {p.activeModel ? shortModel(p.activeModel) : "Local inference"}
              </span>
              <Badge variant="outline" className="engine-badge">
                WebLLM
              </Badge>
            </div>
            <span className="session-status">{status}</span>
          </div>
          {!p.hardware.webgpu && p.hardware.checked && (
            <div className="error-banner">
              <Cpu size={18} />
              <div>
                <strong>WebGPU isn’t available</strong>
                <p>{p.hardware.error}</p>
              </div>
              <TipButton
                label="Recheck WebGPU"
                onClick={() => void p.refreshHardware()}
              >
                <RotateCcw />
              </TipButton>
            </div>
          )}
          {p.error && (
            <div className="error-banner" role="alert">
              <Terminal size={18} />
              <div>
                <strong>Something needs attention</strong>
                <p>{p.error}</p>
              </div>
              <TipButton label="Dismiss error" onClick={() => p.setError(null)}>
                <X />
              </TipButton>
            </div>
          )}
          <div
            className="chat-scroll"
            ref={scrollRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              setNearBottom(
                el.scrollHeight - el.scrollTop - el.clientHeight < 100,
              );
            }}
          >
            {!p.messages.length ? (
              <div className="empty-chat">
                <div className="empty-emblem">
                  <FlaskConical size={29} strokeWidth={1.5} />
                </div>
                <div className="eyebrow empty-eyebrow">
                  SMALL MODELS. YOUR HARDWARE.
                </div>
                <h2>
                  A little intelligence.
                  <br />
                  <span>Right here.</span>
                </h2>
                <p className="empty-description">
                  Your own space to talk to a local model.
                  <br />
                  Try a prompt, tune the settings, see what happens.
                </p>
                <div className="start-step">
                  <span className={cn("step-number", ready && "step-ready")}>
                    {ready ? <Check size={13} /> : "1"}
                  </span>
                  <span>
                    {ready
                      ? "Model loaded. Make yourself curious."
                      : "Load a model from the sidebar to begin."}
                  </span>
                  {!ready && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="empty-load"
                      disabled={!p.hardware.webgpu || busy}
                      onClick={() => void p.load()}
                    >
                      {p.phase === "loading" ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <ArrowRight />
                      )}
                    </Button>
                  )}
                </div>
                <div className="suggestions">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion.title}
                      onClick={() => {
                        setDraft(suggestion.text);
                        inputRef.current?.focus();
                      }}
                    >
                      <suggestion.icon size={17} />
                      <strong>{suggestion.title}</strong>
                      <span>{suggestion.text}</span>
                      <ArrowRight size={14} className="suggestion-arrow" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="messages">
                {p.messages.map((message, index) => (
                  <article
                    key={message.id}
                    className={cn("message", message.role)}
                  >
                    <div className="message-avatar">
                      {message.role === "user" ? (
                        "Y"
                      ) : (
                        <FlaskConical size={17} />
                      )}
                    </div>
                    <div className="message-main">
                      <div className="message-heading">
                        <strong>
                          {message.role === "user" ? "You" : "Local model"}
                        </strong>
                        {message.model && (
                          <span>{shortModel(message.model)}</span>
                        )}
                      </div>
                      <div className="message-body">
                        {!message.content && generating ? (
                          <div className="thinking">
                            <span />
                            <span />
                            <span />
                            <small>Processing your prompt…</small>
                          </div>
                        ) : message.content ? (
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              a: (props) => (
                                <a
                                  {...props}
                                  target="_blank"
                                  rel="noreferrer"
                                />
                              ),
                            }}
                          >
                            {message.content}
                          </ReactMarkdown>
                        ) : (
                          <p className="empty-response">
                            No response text was returned.
                          </p>
                        )}
                      </div>
                      {message.incomplete && (
                        <span className="incomplete-label">
                          Partial response
                        </span>
                      )}
                      <div className="message-actions">
                        {message.content && (
                          <TipButton
                            label="Copy message"
                            className="small-icon"
                            onClick={() => copy(message.id, message.content)}
                          >
                            {copied === message.id ? <Check /> : <Copy />}
                          </TipButton>
                        )}
                        {message.role === "assistant" &&
                          index === p.messages.length - 1 && (
                            <>
                              <TipButton
                                label="Regenerate response"
                                className="small-icon"
                                onClick={() => void p.regenerate()}
                                disabled={busy || !ready}
                              >
                                <RotateCcw />
                              </TipButton>
                              <TipButton
                                label="Edit last prompt"
                                className="small-icon"
                                onClick={() => {
                                  setDraft(p.editLast());
                                  inputRef.current?.focus();
                                }}
                                disabled={busy}
                              >
                                <Pencil />
                              </TipButton>
                            </>
                          )}
                        {p.runs.find((r) => r.id === message.id) && (
                          <span className="message-timing">
                            {formatTime(
                              p.runs.find((r) => r.id === message.id)
                                ?.elapsedMs,
                            )}
                            {p.runs.find((r) => r.id === message.id)
                              ?.outputTokens != null &&
                              ` · ${p.runs.find((r) => r.id === message.id)?.outputTokens} tokens`}
                          </span>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
          <div className="composer-area">
            {!nearBottom && p.messages.length > 0 && (
              <Button
                className="jump-bottom"
                size="sm"
                variant="outline"
                onClick={scrollDown}
              >
                <ArrowDown />
                Latest message
              </Button>
            )}
            {p.phase === "loading" && (
              <div className="inline-progress">
                <LoaderCircle size={14} className="animate-spin" />
                <span title={p.progress.text}>{p.progress.text}</span>
                <strong>{Math.round(p.progress.progress * 100)}%</strong>
              </div>
            )}
            <form
              className={cn("composer", generating && "is-generating")}
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <Textarea
                ref={inputRef}
                aria-label="Message"
                placeholder={
                  ready
                    ? "Message your local model…"
                    : "Write a prompt. Load a model when you’re ready…"
                }
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing &&
                    window.matchMedia("(pointer: fine)").matches
                  ) {
                    event.preventDefault();
                    submit();
                  }
                }}
              />
              <div className="composer-toolbar">
                <div>
                  <span className="composer-model">
                    <Cpu size={14} />
                    {p.activeModel
                      ? shortModel(p.activeModel)
                      : "Model not loaded"}
                  </span>
                  <span className="draft-length">
                    {draft.length.toLocaleString()} chars
                  </span>
                </div>
                {generating ? (
                  <Button
                    type="button"
                    size="icon"
                    className="send-button stop-button"
                    aria-label="Stop generating"
                    onClick={p.stop}
                  >
                    <Square size={15} fill="currentColor" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    size="icon"
                    className="send-button"
                    aria-label="Send message"
                    disabled={!draft.trim() || p.phase !== "ready"}
                  >
                    <ArrowUp size={19} />
                  </Button>
                )}
              </div>
            </form>
            <div className="composer-caption">
              <span>
                {generating
                  ? `Generating · ${formatTime(p.elapsed)}`
                  : "Local models can make mistakes. Experiment thoughtfully."}
              </span>
              <span className="keyboard-note">
                Enter to send · Shift + Enter for newline
              </span>
            </div>
          </div>
          <footer className="stats-bar">
            <div>
              <span className={cn("status-dot", ready && "ready")} />
              <span>
                {ready
                  ? "Worker active"
                  : p.phase === "loading"
                    ? "Initializing worker"
                    : "Engine idle"}
              </span>
            </div>
            <div className="footer-metrics">
              <span>
                <Zap size={13} />
                <b>{last?.decodeRate?.toFixed(1) ?? "—"}</b> tok/s
              </span>
              <span>
                First text <b>{formatTime(last?.firstChunkMs)}</b>
              </span>
              <span>
                Tokens <b>{last?.outputTokens ?? "—"}</b>
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="footer-inspector"
              onClick={() =>
                wide ? setDesktopInspector(true) : setInspectorOpen(true)
              }
            >
              <ActivityIcon />
              Stats
            </Button>
          </footer>
        </main>
        {wide && desktopInspector && (
          <aside className="desktop-inspector">
            <Inspector p={p} />
          </aside>
        )}
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetContent
            side="left"
            className="mobile-sidebar-sheet"
            showCloseButton={false}
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Workspace</SheetTitle>
              <SheetDescription>
                Conversation and model controls
              </SheetDescription>
            </SheetHeader>
            <Sidebar
              p={p}
              onPick={() => {
                setNavOpen(false);
                setPickerOpen(true);
              }}
              onClose={() => setNavOpen(false)}
            />
          </SheetContent>
        </Sheet>
        {!wide && (
          <Sheet open={inspectorOpen} onOpenChange={setInspectorOpen}>
            <SheetContent className="mobile-inspector-sheet">
              <SheetHeader className="sr-only">
                <SheetTitle>Inspector</SheetTitle>
                <SheetDescription>
                  Generation settings, runtime statistics, and logs
                </SheetDescription>
              </SheetHeader>
              <Inspector p={p} />
            </SheetContent>
          </Sheet>
        )}
        <ModelPicker p={p} open={pickerOpen} setOpen={setPickerOpen} />
      </div>
    </TooltipProvider>
  );
}
function ActivityIcon() {
  return <SlidersHorizontal size={14} />;
}

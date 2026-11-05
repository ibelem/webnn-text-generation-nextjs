"use client"

import React from "react"
import { flushSync } from "react-dom"
import type { ModelType, BackendType } from "@/lib/types"
import Image from 'next/image';
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Sparkles, Gpu, Microchip, Loader2, Download, Upload, Cog, RefreshCcw, X, Eye } from "lucide-react"
import { MODELS, BACKENDS } from "../lib/constants"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { Progress } from "@/components/progress"
import type { ProgressProps } from "@/components/progress"

/** Progressive enhancement: run a state mutation inside a View Transition if the API is available. */
function withViewTransition(fn: () => void): void {
  if (typeof document !== "undefined" && "startViewTransition" in document) {
    (document as Document & { startViewTransition(cb: () => void): void }).startViewTransition(
      () => flushSync(fn)
    );
  } else {
    fn();
  }
}

interface SidebarProps {
  selectedModel: ModelType;
  setSelectedModel: (model: ModelType) => void;
  selectedBackend: BackendType;
  setSelectedBackend: (backend: BackendType) => void;
  progressItems: ProgressProps[];
  setProgressItems?: React.Dispatch<React.SetStateAction<ProgressProps[]>>;
  workerRef: React.RefObject<Worker | null>;
  reasonEnabled: boolean;
  setReasonEnabled: (enabled: boolean) => void;
  systemPromptEnabled: boolean;
  setSystemPromptEnabled: (enabled: boolean) => void;
  systemPromptText: string;
  setSystemPromptText: (text: string) => void;
  maxOutputTokens: number;
  setMaxOutputTokens: (tokens: number) => void;
  minOutputTokens: number;
  setMinOutputTokens: (tokens: number) => void;
  maxInputTokens: number;
  setMaxInputTokens: (tokens: number) => void;
  temperature: number;
  setTemperature: (temperature: number) => void;
  modelLoadState: Record<string, "not_loaded" | "loading" | "warm" | "loaded" | "ready">;
  setModelLoadState: React.Dispatch<React.SetStateAction<Record<string, "not_loaded" | "loading" | "warm" | "loaded" | "ready" >>>;
  setIsSidebarOpen?: (open: boolean) => void;
}

export function Sidebar({
  selectedModel,
  setSelectedModel,
  selectedBackend,
  setSelectedBackend,
  progressItems,
  setProgressItems,
  workerRef,
  reasonEnabled,
  setReasonEnabled,
  systemPromptEnabled,
  setSystemPromptEnabled,
  systemPromptText,
  setSystemPromptText,
  maxOutputTokens,
  setMaxOutputTokens,
  minOutputTokens,
  setMinOutputTokens,
  maxInputTokens,
  setMaxInputTokens,
  temperature,
  setTemperature,
  modelLoadState,
  setModelLoadState,
  setIsSidebarOpen,
}: SidebarProps) {
  const [compilationTime, setCompilationTime] = React.useState<number | null>(null);
  const [remoteHost, setRemoteHost] = React.useState<string>('huggingface.co');
  const [loadError, setLoadError] = React.useState<string | null>(null);
  // Directory handle for a locally-uploaded model. Kept on the main thread (not
  // sent to the worker) since FileSystemHandle permissions are scoped to the
  // context that opened the picker; the worker requests files by path instead.
  const localDirHandleRef = React.useRef<FileSystemDirectoryHandle | null>(null);

  // Reads a single file requested by the worker from the local model directory
  // and sends its bytes back, or an error if the path can't be resolved.
  const respondToLocalFileRequest = React.useCallback(async (worker: Worker, requestId: number, relPath: string) => {
    const dir = localDirHandleRef.current;
    if (!dir) {
      worker.postMessage({ type: "readLocalFileError", requestId, message: "No local model folder is loaded." });
      return;
    }
    try {
      const parts = relPath.split("/").filter(Boolean);
      let cur = dir;
      for (let i = 0; i < parts.length - 1; i++) {
        cur = await cur.getDirectoryHandle(parts[i]);
      }
      const file = await (await cur.getFileHandle(parts[parts.length - 1])).getFile();
      const buffer = await file.arrayBuffer();
      worker.postMessage({ type: "readLocalFileResult", requestId, buffer }, [buffer]);
    } catch (err) {
      console.warn(`[Sidebar] Local model file not found: "${relPath}"`, err);
      worker.postMessage({
        type: "readLocalFileError",
        requestId,
        message: err instanceof Error ? err.message : `Could not read "${relPath}".`,
      });
    }
  }, []);

  // Listen for worker "ready", "loading", "reset" events to update modelLoadState and progress
  React.useEffect(() => {
    if (!workerRef.current) return;
    const currentWorker = workerRef.current;

    function onWorkerMessage(e: MessageEvent) {
      const { status, model_id, data, file, progress, total, compilationTime, remoteHost, requestId, relPath } = e.data;
      if (status === "readLocalFile") {
        respondToLocalFileRequest(currentWorker, requestId, relPath);
        return;
      }
      if (!model_id && status !== "initiate" && status !== "progress" && status !== "done" && status !== "init") return;

      if (status === "error") {
        console.error(`[Worker] Model load error (${model_id}):`, data);
        withViewTransition(() => {
          setLoadError(data ?? "Unknown error");
          setModelLoadState((prev) => ({ ...prev, [model_id]: "not_loaded" }));
          setProgressItems?.([]);
        });
        return;
      }

      if (status === "init" && remoteHost) {
        setRemoteHost(remoteHost);
        return;
      }
      if (status === "loading") {
        withViewTransition(() => {
          setLoadError(null); // clear any previous error
          setModelLoadState((prev) => ({ ...prev, [model_id]: "loading" }));
        });
        if (data) {
          setProgressItems?.([{ text: data, progress: 0 }]);
        }
      } else if (status === "initiate") {
        // File download started
        setProgressItems?.((prev) => {
          const list = prev || [];
          // Some files (e.g. preprocessor_config.json) are requested by multiple
          // model components. Reuse the existing entry instead of appending a
          // duplicate, which would create non-unique React keys.
          if (list.some((item) => item.file === file)) {
            return list.map((item) =>
              item.file === file ? { ...item, progress: 0, total, text: file } : item
            );
          }
          return [
            ...list,
            {
              file,
              progress: 0,
              total,
              text: file,
            },
          ];
        });
      } else if (status === "progress") {
        setProgressItems?.((prev) =>
          (prev || []).map((item) =>
            item.file === file
              ? {
                  ...item,
                  progress: typeof progress === "number" ? progress / 100 : 0, // Use fraction for Progress
                  total,
                }
              : item
          )
        );
      } else if (status === "done") {
        // File download completed — keep visible at 100%
        setProgressItems?.((prev) =>
          (prev || []).map((item) =>
            item.file === file
              ? { ...item, progress: 1 }
              : item
          )
        );
      } else if (status === "warm") {
        withViewTransition(() => {
          setModelLoadState((prev) => ({ ...prev, [model_id]: "warm" }));
          if (typeof compilationTime === "number") {
            setCompilationTime(compilationTime);
          }
        });
      } else if (status === "loaded") {
        withViewTransition(() => {
          setModelLoadState((prev) => ({ ...prev, [model_id]: "loaded" }));
        });
      } else if (status === "ready") {
        withViewTransition(() => {
          setModelLoadState((prev) => ({ ...prev, [model_id]: "ready" }));
          setProgressItems?.([]); // Clear all progress when model is ready
        });
      } else if (status === "reset") {
        withViewTransition(() => {
          setModelLoadState((prev) => ({ ...prev, [model_id]: "not_loaded" }));
          setProgressItems?.([]);
        });
      }
    }

    currentWorker.addEventListener("message", onWorkerMessage);
    return () => {
      currentWorker.removeEventListener("message", onWorkerMessage);
    };
  }, [setProgressItems, setModelLoadState, workerRef, respondToLocalFileRequest]);

  // Selecting a model (from the list or via the download icon) also resets the
  // temperature to that model's default from constants.ts, so the correct value
  // is applied when the model loads.
  const handleSelectModel = (modelId: ModelType) => {
    setTemperature(MODELS.find((m) => m.id === modelId)?.temperature ?? 0.6);
    setSelectedModel(modelId);
  };

  // Handler for load/reload button
  const handleLoadModel = (modelId: string) => {
    setCompilationTime(null);
    // A network (re)download supersedes any previously uploaded local folder.
    localDirHandleRef.current = null;

    if (modelId !== selectedModel) {
      handleSelectModel(modelId as ModelType);
      // Store as fallback for full page remounts (when the URL path change
      // terminates the current worker and a new one is created). Not needed for
      // same-model reloads — the direct postMessage below handles those.
      sessionStorage.setItem("pendingAutoLoad", modelId);
    }

    // Send setConfig + load directly to the current worker for both same-model
    // and cross-model cases. The worker clears its state on setConfig, so the
    // same Worker instance can load any model without needing a page remount.
    withViewTransition(() => setModelLoadState((prev) => ({ ...prev, [modelId]: "loading" })));
    const selectedModelObj = MODELS.find((m) => m.id === modelId);
    if (selectedModelObj) {
      workerRef.current?.postMessage({
        type: "setConfig",
        model_id: modelId,
        data_type: selectedModelObj.dataType,
        device: selectedBackend,
      });
    }
    workerRef.current?.postMessage({ type: "load" });
  };

  // Recursively lists every file path under a directory handle, relative to it
  // (e.g. "config.json", "onnx/model_q4f16.onnx"), used to validate the folder
  // before handing it to the worker.
  const listFilesInDir = async (dir: FileSystemDirectoryHandle, prefix = ""): Promise<string[]> => {
    const paths: string[] = [];
    const iterable = dir as unknown as AsyncIterable<[string, FileSystemHandle]>;
    for await (const [name, handle] of iterable) {
      const rel = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === "directory") {
        paths.push(...(await listFilesInDir(handle as FileSystemDirectoryHandle, rel)));
      } else {
        paths.push(rel);
      }
    }
    return paths;
  };

  // Validates the user-selected local model folder, then hands the directory
  // handle itself to the worker — files are read directly from disk on demand
  // (no local-path/network fallback), so nothing is duplicated in memory.
  // Throws on any validation/read failure; the caller is responsible for
  // surfacing the error and resetting the row's load state.
  const loadLocalModelFromDir = async (model: (typeof MODELS)[number], dir: FileSystemDirectoryHandle) => {
    let paths: string[];
    try {
      paths = await listFilesInDir(dir);
    } catch (err) {
      throw new Error(`Could not read the selected folder "${dir.name}": ${err instanceof Error ? err.message : err}`);
    }

    const expectedRepoName = model.model.split("/").pop() ?? "";
    const hasConfig = paths.includes("config.json");
    const hasOnnx = paths.some((p) => /\.onnx$/i.test(p));
    const hasTokenizerJson = paths.includes("tokenizer.json");
    const hasTokenizerConfig = paths.includes("tokenizer_config.json");

    if (!hasConfig || !hasOnnx) {
      throw new Error(
        `Selected folder "${dir.name}" is missing required model files (config.json / *.onnx). Please choose the local "${expectedRepoName}" model folder.`
      );
    }
    // transformers.js probes tokenizer_config.json before deciding which
    // tokenizer files to load; if it's missing, tokenizer loading silently
    // fails deep inside the library instead of a clear error, so check here.
    if (!hasTokenizerJson || !hasTokenizerConfig) {
      throw new Error(
        `Selected folder is missing tokenizer files (tokenizer.json and tokenizer_config.json are both required).`
      );
    }

    let config: unknown;
    try {
      const configFile = await (await dir.getFileHandle("config.json")).getFile();
      config = JSON.parse(await configFile.text());
    } catch {
      throw new Error(`"config.json" in the selected folder is not valid JSON.`);
    }

    // Prefer config.json's own `_name_or_path` (set by transformers when the
    // model was exported/saved) to detect a mismatched folder — it survives
    // the user renaming/reorganizing the folder, unlike the folder name.
    const nameOrPath = typeof (config as { _name_or_path?: unknown })?._name_or_path === "string"
      ? (config as { _name_or_path: string })._name_or_path
      : null;
    if (nameOrPath) {
      const matches =
        nameOrPath.toLowerCase().includes(expectedRepoName.toLowerCase()) ||
        model.model.toLowerCase().includes(nameOrPath.split("/").pop()!.toLowerCase());
      if (!matches) {
        throw new Error(
          `Selected folder's config.json looks like it belongs to "${nameOrPath}", not "${model.name}" (expected "${model.model}").`
        );
      }
    } else if (expectedRepoName && !dir.name.toLowerCase().includes(expectedRepoName.toLowerCase())) {
      // No _name_or_path to check against — fall back to the folder name as a
      // weaker signal.
      throw new Error(
        `Selected folder "${dir.name}" does not appear to match "${model.name}" (expected a folder named like "${expectedRepoName}").`
      );
    }

    localDirHandleRef.current = dir;
    workerRef.current?.postMessage({
      type: "loadLocal",
      model_id: model.id,
      data_type: model.dataType,
      device: selectedBackend,
    });
  };

  // "Upload local model" button — opens the OS folder picker and loads the
  // model straight from that local path (no file is read/copied up front).
  const triggerLocalUpload = async (model: (typeof MODELS)[number]) => {
    setLoadError(null);
    if (!("showDirectoryPicker" in window)) {
      setLoadError("This browser doesn't support selecting a local model folder. Please use a recent Chromium-based browser.");
      return;
    }
    let dir: FileSystemDirectoryHandle;
    try {
      dir = await (window as unknown as { showDirectoryPicker: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle> })
        .showDirectoryPicker({ mode: "read" });
    } catch (err) {
      // User cancelled the picker — not an error worth surfacing.
      if (err instanceof DOMException && err.name === "AbortError") return;
      setLoadError(err instanceof Error ? err.message : "Failed to open the folder picker.");
      return;
    }

    setCompilationTime(null);
    if (model.id !== selectedModel) {
      handleSelectModel(model.id);
      sessionStorage.setItem("pendingAutoLoad", model.id);
    }
    // Give immediate feedback — scanning/validating the folder can take a
    // moment, and without this the UI looked unresponsive until it finished.
    withViewTransition(() => setModelLoadState((prev) => ({ ...prev, [model.id]: "loading" })));
    setProgressItems?.([{ text: "Scanning local model folder…", progress: 0 }]);

    try {
      await loadLocalModelFromDir(model, dir);
    } catch (err) {
      console.error("[Sidebar] Local model load failed:", err);
      setLoadError(err instanceof Error ? err.message : "Failed to load the selected local model folder.");
      withViewTransition(() => setModelLoadState((prev) => ({ ...prev, [model.id]: "not_loaded" })));
      setProgressItems?.([]);
    }
  };

  // Pass modelLoadState and handler to ModelOption
  return (
    <div className="h-full flex flex-col bg-white p-3 md:p-4 sidebar-enter">
      <div className="grid grid-cols-2 items-center mb-3 md:mb-4 px-1">
        <Image
          src="/webgpu-logo-h.svg"
          alt="WebGPU Logo"
          width={106}
          height={32}
          className="mb-[-6px]"
        />
        <Image
          src="/webnn-logo.svg"
          alt="WebNN Logo"
          width={140}
          height={40}
          className="justify-self-end"
          style={{ width: '140px', height: '40px' }}
          priority
        />
      </div>

      <Tabs defaultValue="models" className="gap-0">
        <TabsList className="grid grid-cols-2 p-1 gap-1 mb-3 h-[auto] w-full rounded-md bg-gray-100/80 border border-gray-200/60">
          <TabsTrigger className="flex-1 px-3 py-2.5 rounded-md text-xs md:text-sm font-medium transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm border-none hover:cursor-pointer data-[state=inactive]:text-gray-400 hover:bg-white/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
            value="models"> 
            Models
          </TabsTrigger>
          <TabsTrigger className="flex-1 px-3 py-2.5 rounded-md text-xs md:text-sm font-medium transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm border-none hover:cursor-pointer data-[state=inactive]:text-gray-400 hover:bg-white/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
            value="backends">
            Backends
          </TabsTrigger>
        </TabsList>

        <TabsContent value="models" className="outline-none">
          <Tabs
            defaultValue={
              MODELS.find((m) => m.id === selectedModel)?.capabilities?.some((c) => c !== "text")
                ? "multimodal"
                : "text"
            }
            className="flex flex-col gap-0"
          >
            <TabsList className="grid grid-cols-2 p-0.5 gap-0.5 h-[auto] w-full rounded-tl-md rounded-tr-md rounded-bl-none rounded-br-none bg-gray-100/60 border border-gray-200/40">
              <TabsTrigger
                className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-tl-md rounded-tr-none rounded-bl-none rounded-br-none font-medium transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm border-none hover:cursor-pointer data-[state=inactive]:text-gray-400 hover:bg-white/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                value="text"
              >
                <Sparkles className="h-3 w-3" />
                Text
              </TabsTrigger>
              <TabsTrigger
                className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-tl-none rounded-tr-md rounded-bl-none rounded-br-none font-medium transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm border-none hover:cursor-pointer data-[state=inactive]:text-gray-400 hover:bg-white/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                value="multimodal"
              >
                <Eye className="h-3 w-3" />
                Multimodal
              </TabsTrigger>
            </TabsList>
            <TabsContent value="text" className="max-h-[45vh] overflow-y-auto overflow-x-hidden rounded-bl-md rounded-br-md border border-gray-200/60">
              {MODELS.filter((m) => !m.capabilities || m.capabilities.length === 0 || (m.capabilities.length === 1 && m.capabilities[0] === "text")).map((model) => (
                <ModelOption
                  key={model.id}
                  model={model}
                  isSelected={selectedModel === model.id}
                  onClick={() => handleSelectModel(model.id)}
                  loadState={modelLoadState[model.id] || "not_loaded"}
                  onLoad={() => handleLoadModel(model.id)}
                  onUploadLocal={() => triggerLocalUpload(model)}
                />
              ))}
            </TabsContent>
            <TabsContent value="multimodal" className="max-h-[45vh] overflow-y-auto overflow-x-hidden rounded-bl-md rounded-br-md border border-gray-200/60">
              {MODELS.filter((m) => m.capabilities && m.capabilities.some((c) => c !== "text")).map((model) => (
                <ModelOption
                  key={model.id}
                  model={model}
                  isSelected={selectedModel === model.id}
                  onClick={() => handleSelectModel(model.id)}
                  loadState={modelLoadState[model.id] || "not_loaded"}
                  onLoad={() => handleLoadModel(model.id)}
                  onUploadLocal={() => triggerLocalUpload(model)}
                />
              ))}
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="backends" className="space-y-2">
          {BACKENDS.map((backend) => (
            <BackendOption
              key={backend.id}
              backend={backend}
              isSelected={selectedBackend === backend.id}
              onClick={() => setSelectedBackend(backend.id)}
            />
          ))}
        </TabsContent>
      </Tabs>

      <div className="pt-4">
        {loadError && (
          <div className="mb-3 rounded-md bg-red-50 border border-red-200 p-3 text-xs text-red-700 break-words flex items-start gap-2">
            <X className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-red-500" />
            <span>{loadError}</span>
          </div>
        )}
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">Configuration</div>
          <div id="compilation-time" className="text-xs font-medium text-blue-500">
            {compilationTime !== null ? `${compilationTime.toFixed(0)}ms warm-up` : ""}
          </div>
        </div>
        <div className="bg-gray-50/80 rounded-md p-3 md:p-3.5 text-xs md:text-sm mb-2 md:max-h-[40vh] md:overflow-y-auto border border-gray-100 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-xs">Model</span>
            <a 
              href={`https://huggingface.co/${MODELS.find((m) => m.id === selectedModel)?.model || selectedModel}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-500 font-semibold text-right hover:text-blue-600 hover:underline transition-colors max-w-[60%] truncate"
            >
              {MODELS.find((m) => m.id === selectedModel)?.model || selectedModel}
            </a>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-xs">Hardware</span>
            <span className="font-semibold text-xs">{BACKENDS.find(b => b.id === selectedBackend)?.name || selectedBackend}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-xs">Downloaded from</span>
            <span className="font-semibold text-xs">{remoteHost}</span>
          </div>
          {/* Reasoning toggle UI */}
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-xs">Reasoning</span>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <span className="text-xs font-semibold text-gray-700">{reasonEnabled ? "On" : "Off"}</span>
              <input
                type="checkbox"
                checked={reasonEnabled}
                onChange={e => setReasonEnabled(e.target.checked)}
                className="toggle-switch"
              />
            </label>
          </div>
          {/* System Prompt toggle UI */}
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-xs">System Prompt</span>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <span className="text-xs font-semibold text-gray-700">{systemPromptEnabled ? "On" : "Off"}</span>
              <input
                type="checkbox"
                checked={systemPromptEnabled}
                onChange={e => setSystemPromptEnabled(e.target.checked)}
                className="toggle-switch"
              />
            </label>
          </div>
          {systemPromptEnabled && (
            <div className="pt-0.5">
              <Textarea
                value={systemPromptText}
                onChange={(e) => setSystemPromptText(e.target.value)}
                className="text-xs min-h-[50px] bg-white max-h-[10vh] overflow-y-auto rounded-md border-gray-200 focus:border-blue-300"
                placeholder="Instructions for the model (e.g. 'Reply only in French')"
              />
            </div>
          )}
          {/* Temperature (0..1) — applied when the model is loaded */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-gray-400 text-xs whitespace-nowrap">Temperature</span>
            <div className="flex items-center gap-2 flex-1 justify-end">
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-28 accent-blue-500 cursor-pointer"
                title="Sampling temperature: 0 = deterministic, 1 = most random (applied on each generation)"
              />
              <span className="text-xs font-semibold text-gray-700 w-7 text-right tabular-nums">
                {temperature.toFixed(1)}
              </span>
            </div>
          </div>
          {/* Token length parameters */}
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-xs">Max Input Tokens</span>
            <select
              value={maxInputTokens}
              onChange={(e) => setMaxInputTokens(parseInt(e.target.value))}
              className="w-24 text-xs font-semibold text-right bg-white border border-gray-200 rounded-md px-2 py-1 focus:border-blue-300 focus:outline-none cursor-pointer"
              title="Max input/context tokens (default = unlimited)"
            >
              {[0, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768].map((v) => (
                <option key={v} value={v}>{v === 0 ? "default" : v}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-xs">Min Output Tokens</span>
            <select
              value={minOutputTokens}
              onChange={(e) => setMinOutputTokens(parseInt(e.target.value))}
              className="w-24 text-xs font-semibold text-right bg-white border border-gray-200 rounded-md px-2 py-1 focus:border-blue-300 focus:outline-none cursor-pointer"
              title="Min tokens to generate (default = no minimum)"
            >
              {[0, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768].map((v) => (
                <option key={v} value={v}>{v === 0 ? "default" : v}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-xs">Max Output Tokens</span>
            <select
              value={maxOutputTokens}
              onChange={(e) => setMaxOutputTokens(parseInt(e.target.value))}
              className="w-24 text-xs font-semibold text-right bg-white border border-gray-200 rounded-md px-2 py-1 focus:border-blue-300 focus:outline-none cursor-pointer"
              title="Max tokens to generate (default = model default)"
            >
              {[0, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768].map((v) => (
                <option key={v} value={v}>{v === 0 ? "default" : v}</option>
              ))}
            </select>
          </div>
        </div>
        {/* Progress bar UI (show only if loading/progress is needed) */}
        {progressItems && progressItems.length > 0 && (
          <div className="my-2 space-y-1">
            {progressItems.map((item, i) => (
              <Progress
                key={item.file || i}
                text={item.file || item.text}
                progress={item.progress}
                total={item.total}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface ModelOptionProps {
  model: typeof MODELS[number];
  isSelected: boolean;
  onClick: () => void;
  loadState: "not_loaded" | "loading" | "warm" | "loaded" | "ready";
  onLoad: () => void;
  onUploadLocal: () => void;
}

function ConfigRow({ label, value }: { label: string; value: unknown }) {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return (
      <div>
        <span className="text-gray-400">{label}:</span>
        <div className="pl-3 mt-0.5 space-y-0.5">
          {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
            <div key={k} className="flex gap-1.5">
              <span className="text-gray-400 shrink-0">{k}:</span>
              <span>{typeof v === "string" ? `"${v}"` : String(v)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  const displayValue = Array.isArray(value)
    ? `[${(value as string[]).map((v) => `"${v}"`).join(", ")}]`
    : typeof value === "string"
    ? `"${value}"`
    : String(value);
  return (
    <div className="flex gap-1.5 flex-wrap">
      <span className="text-gray-400 shrink-0">{label}:</span>
      <span className="break-all">{displayValue}</span>
    </div>
  );
}

function ModelOption({ model, isSelected, onClick, loadState, onLoad, onUploadLocal }: ModelOptionProps) {
  const configFields: Array<{ key: string; value: unknown }> = [
    { key: "model", value: model.model },
    { key: "dataType", value: model.dataType },
    ...(model.useExternalDataFormat !== undefined ? [{ key: "useExternalDataFormat", value: model.useExternalDataFormat }] : []),
    ...(model.maxNewTokens !== undefined ? [{ key: "maxNewTokens", value: model.maxNewTokens }] : []),
    ...(model.doSample !== undefined ? [{ key: "doSample", value: model.doSample }] : []),
    ...(model.topK !== undefined ? [{ key: "topK", value: model.topK }] : []),
    ...(model.capabilities && model.capabilities.length > 0 ? [{ key: "capabilities", value: model.capabilities }] : []),
    ...(model.modelClass ? [{ key: "modelClass", value: model.modelClass }] : []),
  ];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
    <div
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className={`flex items-center py-3 px-3 md:py-2 md:px-3 cursor-pointer transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400 ${isSelected ? "bg-blue-50/50 border-l-2 border-l-blue-400" : "hover:bg-gray-50/80 border-l-2 border-l-transparent"}`}
      onClick={onClick}
    >
      <div className="flex-1 min-w-0">
        <div className="flex font-medium text-sm md:text-base items-center text-gray-700 truncate">
          <Sparkles className={`h-3 w-3 mr-1.5 flex-shrink-0 ${isSelected ? 'text-blue-500' : 'text-gray-300'}`} />
          {model.name}
        </div>
        <div className="flex flex-wrap items-center gap-1 mt-1 ml-[18px]">
          <span className={`text-[10px] leading-tight px-1.5 py-0.5 rounded ${
            model.producer === 'WIP' 
              ? 'bg-amber-100 text-amber-700' 
              : 'bg-gray-100 text-gray-500'
          }`}>
            {model.producer}
          </span>
          <span className="bg-gray-100 text-gray-500 text-[10px] leading-tight px-1.5 py-0.5 rounded">{model.desc}</span>
          <span className="bg-blue-100 text-blue-600 text-[10px] leading-tight px-1.5 py-0.5 rounded font-medium">{model.parameter}</span>
          <span className="bg-gray-100 text-gray-500 text-[10px] leading-tight px-1.5 py-0.5 rounded">{model.size}</span>
        </div>
      </div>
      {/* Load/Reload Button */}
      <div className="ml-2 flex-shrink-0" style={{ viewTransitionName: `download-${model.id.replace(/[^a-zA-Z0-9]/g, '-')}` } as React.CSSProperties}>
        {loadState === "loading" ? (
          <div className="flex flex-col items-center gap-0.5 w-10">
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
            <span className="text-[10px] text-gray-400">Loading</span>
          </div>
        ) : loadState === "warm" ? (
          <div className="flex flex-col items-center gap-0.5 w-10">
            <Cog className="h-4 w-4 animate-spin text-amber-500" />
            <span className="text-[10px] text-gray-400">Warming up</span>
          </div>
        ) : (
          <div className="flex items-center">
            <Button
              title="Load a local model folder from disk and run it fully offline"
              variant="ghost"
              size="sm"
              className="h-10 w-10 md:h-8 md:w-8 p-0 rounded-md hover:bg-blue-50 hover:cursor-pointer border-none shadow-none bg-transparent hover:bg-blue-50/80 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onUploadLocal();
              }}
            >
              <Upload className="h-4 w-4 text-gray-400 hover:text-blue-500" />
            </Button>
            <Button
              title={loadState === "not_loaded" ? "Download model weights to run locally" : "Re-download model weights"}
              variant="ghost"
              size="sm"
              className="h-10 w-10 md:h-8 md:w-8 p-0 rounded-md hover:bg-blue-50 hover:cursor-pointer border-none shadow-none bg-transparent hover:bg-blue-50/80 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onLoad();
              }}
            >
              {loadState === "not_loaded" ? (
                <Download className="h-4 w-4 text-gray-400 hover:text-blue-500" />
              ) : (
                <RefreshCcw className="h-3.5 w-3.5 text-green-500" />
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8} className="max-w-[300px] p-3 font-mono">
        <div className="space-y-1 text-[11px]">
          {configFields.map(({ key, value }) => (
            <ConfigRow key={key} label={key} value={value} />
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

interface BackendOptionProps {
  backend: { id: BackendType; name: string };
  isSelected: boolean;
  onClick: () => void;
}

function BackendOption({ backend, isSelected, onClick }: BackendOptionProps) {
  let Icon = Gpu;
  if (backend.id === "webnn-npu") Icon = Microchip;
  return (
    <div
      role="radio"
      aria-checked={isSelected}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className={`flex items-center p-3 md:p-3.5 rounded-md cursor-pointer transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${isSelected ? "bg-blue-50/60 border border-blue-200/60 shadow-sm" : "hover:bg-gray-50 border border-transparent"}`}
      onClick={onClick}
    >
      <div className={`p-2.5 rounded-md mr-3 flex-shrink-0 transition-colors ${isSelected ? "bg-white shadow-sm text-blue-500" : "bg-gray-100 text-gray-400"}`}>
        <Icon className="h-4 w-4 md:h-5 md:w-5" />
      </div>
      <div className="flex-1">
        <div className="font-medium text-sm md:text-base">{backend.name}</div>
        <div className="text-[11px] md:text-xs text-gray-400">Inference backend</div>
      </div>
      {isSelected && (
        <div className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
      )}
    </div>
  );
}

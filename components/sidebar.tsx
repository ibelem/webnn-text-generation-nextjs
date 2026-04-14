"use client"

import React from "react"
import { flushSync } from "react-dom"
import type { ModelType, BackendType } from "@/lib/types"
import Image from 'next/image';
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Sparkles, Gpu, Microchip, Loader2, Download, Cog, RefreshCcw, X, Eye } from "lucide-react"
import { MODELS, BACKENDS } from "../lib/constants"
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
  maxInputTokens: number;
  setMaxInputTokens: (tokens: number) => void;
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
  maxInputTokens,
  setMaxInputTokens,
  modelLoadState,
  setModelLoadState,
  setIsSidebarOpen,
}: SidebarProps) {
  const [compilationTime, setCompilationTime] = React.useState<number | null>(null);
  const [remoteHost, setRemoteHost] = React.useState<string>('huggingface.co');
  const [loadError, setLoadError] = React.useState<string | null>(null);

  // Listen for worker "ready", "loading", "reset" events to update modelLoadState and progress
  React.useEffect(() => {
    if (!workerRef.current) return;
    const currentWorker = workerRef.current;

    function onWorkerMessage(e: MessageEvent) {
      const { status, model_id, data, file, progress, total, compilationTime, remoteHost } = e.data;
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
        setProgressItems?.((prev) => [
          ...(prev || []),
          {
            file,
            progress: 0,
            total,
            text: file,
          }
        ]);
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
  }, [setProgressItems, setModelLoadState, workerRef]);

  // Handler for load/reload button
  const handleLoadModel = (modelId: string) => {
    setCompilationTime(null);

    if (modelId !== selectedModel) {
      // Navigating to a different model causes router.replace → full page remount →
      // the current worker is terminated and a new one is created. Any messages sent
      // here would go to the dead worker. Instead, store the intent in sessionStorage
      // so the new page instance picks it up once its worker is ready.
      sessionStorage.setItem("pendingAutoLoad", modelId);
      setSelectedModel(modelId as ModelType);
      return;
    }

    // Same model — worker is alive, send directly.
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
                  onClick={() => setSelectedModel(model.id)}
                  loadState={modelLoadState[model.id] || "not_loaded"}
                  onLoad={() => handleLoadModel(model.id)}
                />
              ))}
            </TabsContent>
            <TabsContent value="multimodal" className="max-h-[45vh] overflow-y-auto overflow-x-hidden rounded-bl-md rounded-br-md border border-gray-200/60">
              {MODELS.filter((m) => m.capabilities && m.capabilities.some((c) => c !== "text")).map((model) => (
                <ModelOption
                  key={model.id}
                  model={model}
                  isSelected={selectedModel === model.id}
                  onClick={() => setSelectedModel(model.id)}
                  loadState={modelLoadState[model.id] || "not_loaded"}
                  onLoad={() => handleLoadModel(model.id)}
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
          {/* Reasoning toggle UI: only show if thinkingTagSupport is true */}
          {MODELS.find((m) => m.id === selectedModel)?.thinkingTagSupport && (
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
          )}
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
  model: { id: ModelType; name: string; producer:string, desc: string, parameter: string, size: string };
  isSelected: boolean;
  onClick: () => void;
  loadState: "not_loaded" | "loading" | "warm" | "loaded" | "ready";
  onLoad: () => void;
}

function ModelOption({ model, isSelected, onClick, loadState, onLoad }: ModelOptionProps) {
  return (
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
        )}
      </div>
    </div>
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

"use client"

import React from "react"
import { motion } from "framer-motion"
import type { ModelType, BackendType } from "@/lib/types"
import Image from 'next/image';
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Sparkles, Gpu, Microchip, Loader2, Download, Cog, RefreshCcw, X } from "lucide-react"
import { MODELS, BACKENDS } from "../lib/constants"
import { Progress } from "@/components/progress"
import type { ProgressProps } from "@/components/progress"

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
  writingAssistantEnabled: boolean;
  setWritingAssistantEnabled: (enabled: boolean) => void;
  writingAssistantPrompt: string;
  setWritingAssistantPrompt: (prompt: string) => void;
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
  writingAssistantEnabled,
  setWritingAssistantEnabled,
  writingAssistantPrompt,
  setWritingAssistantPrompt,
  modelLoadState,
  setModelLoadState,
  setIsSidebarOpen,
}: SidebarProps) {
  const [compilationTime, setCompilationTime] = React.useState<number | null>(null);
  const [remoteHost, setRemoteHost] = React.useState<string>('huggingface.co');

  // Listen for worker "ready", "loading", "reset" events to update modelLoadState and progress
  React.useEffect(() => {
    if (!workerRef.current) return;
    const currentWorker = workerRef.current;

    function onWorkerMessage(e: MessageEvent) {
      const { status, model_id, data, file, progress, total, compilationTime, remoteHost } = e.data;
      if (!model_id && status !== "initiate" && status !== "progress" && status !== "done" && status !== "init") return;


      if (status === "init" && remoteHost) {
        setRemoteHost(remoteHost);
        return;
      }
      if (status === "loading") {
        setModelLoadState((prev) => ({ ...prev, [model_id]: "loading" }));
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
        setModelLoadState((prev) => ({ ...prev, [model_id]: "warm" }));
        if (typeof compilationTime === "number") {
          setCompilationTime(compilationTime);
        }
      } else if (status === "loaded") {
        setModelLoadState((prev) => ({ ...prev, [model_id]: "loaded" }));
      } else if (status === "ready") {
        setModelLoadState((prev) => ({ ...prev, [model_id]: "ready" }));
        setProgressItems?.([]); // Clear all progress when model is ready
      } else if (status === "reset") {
        setModelLoadState((prev) => ({ ...prev, [model_id]: "not_loaded" }));
        setProgressItems?.([]);
      }
    }

    currentWorker.addEventListener("message", onWorkerMessage);
    return () => {
      currentWorker.removeEventListener("message", onWorkerMessage);
    };
  }, [setProgressItems, setModelLoadState, workerRef]);

  // Handler for load/reload button
  const handleLoadModel = (modelId: string) => {
    setSelectedModel(modelId as ModelType);
    setCompilationTime(null);
    setModelLoadState((prev) => ({ ...prev, [modelId]: "loading" }));
    
    // First set the config for this model
    const selectedModelObj = MODELS.find((m) => m.id === modelId);
    if (selectedModelObj) {
      workerRef.current?.postMessage({
        type: "setConfig",
        model_id: modelId,
        data_type: selectedModelObj.dataType,
        device: selectedBackend,
      });
    }
    
    // Then load the model
    workerRef.current?.postMessage({ type: "load" });
  };

  // Pass modelLoadState and handler to ModelOption
  return (
    <div className="h-full flex flex-col bg-white p-3 md:p-4">
      <div className="grid grid-cols-2 items-center mb-3 md:mb-4">
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

      <Tabs defaultValue="models" className="flex-1 gap-0">
        <TabsList className="grid grid-cols-2 p-1 gap-1 mb-3 h-[auto] w-full rounded-lg bg-gray-100 border border-gray-200">
          <TabsTrigger className="flex-1 px-3 py-2.5 rounded-md text-xs md:text-sm font-medium transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm border-none hover:cursor-pointer data-[state=inactive]:text-gray-500 hover:bg-white/60 focus:outline-none"
            value="models"> 
            Models
          </TabsTrigger>
          <TabsTrigger className="flex-1 px-3 py-2.5 rounded-md text-xs md:text-sm font-medium transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm border-none hover:cursor-pointer data-[state=inactive]:text-gray-500 hover:bg-white/60 focus:outline-none"
            value="backends">
            Backends
          </TabsTrigger>
        </TabsList>

        <TabsContent value="models" className="max-h-[60vh] overflow-y-auto overflow-x-hidden rounded-lg border border-blue-100 ">
          {MODELS.map((model) => (
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

        <TabsContent value="backends" className="space-y-1">
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

      <div className="mt-auto pt-2">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] md:text-xs text-gray-500 ml-2 md:ml-3">Current Configuration</div>
          <div id="compilation-time" className="text-[10px] md:text-xs text-pink-600">
            {compilationTime !== null ? `Compilation: ${compilationTime.toFixed(2)} ms` : ""}
          </div>
        </div>
        {/* Progress bar UI (show only if loading/progress is needed) */}
        <div className="my-2">
              {progressItems && progressItems.length > 0 &&
          progressItems.map((item, i) => (
            <Progress
              key={item.file || i}
              text={item.file || item.text}
              progress={item.progress}
              total={item.total}
            />
          ))}
        </div>
        <div className="bg-gray-100 rounded-md p-2 md:p-3 text-xs md:text-sm mb-2 md:max-h-[40vh] md:overflow-y-auto">
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Model</span>
            <a 
              href={`https://huggingface.co/${MODELS.find((m) => m.id === selectedModel)?.model || selectedModel}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-500 font-medium text-right hover:text-blue-600 hover:underline transition-colors"
            >
              {MODELS.find((m) => m.id === selectedModel)?.model || selectedModel}
            </a>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-gray-500">Backend</span>
            <span className="font-medium">{selectedBackend}</span>
          </div>
          {/* Reasoning toggle UI: only show if thinkingTagSupport is true */}
          {MODELS.find((m) => m.id === selectedModel)?.thinkingTagSupport && (
            <div className="flex items-center justify-between mt-2">
              <span className="text-gray-500">Reasoning</span>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={reasonEnabled}
                  onChange={e => setReasonEnabled(e.target.checked)}
                  className="mr-2"
                />
                <span className="font-medium">
                  Enable <span className="font-medium">Thinking</span>
                </span>
              </label>
            </div>
          )}
          {/* Writing Assistant toggle UI */}
          <div className="flex items-center justify-between mt-2">
            <span className="text-gray-500">Writing Assistant</span>
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={writingAssistantEnabled}
                onChange={e => setWritingAssistantEnabled(e.target.checked)}
                className="mr-2"
              />
              <span className="font-medium">
                Enable
              </span>
            </label>
          </div>
          {writingAssistantEnabled && (
            <div className="mt-2">
              <div className="text-gray-500 mb-1">System Prompt</div>
              <Textarea
                value={writingAssistantPrompt}
                onChange={(e) => setWritingAssistantPrompt(e.target.value)}
                className="text-xs min-h-[50px] bg-white max-h-[10vh] overflow-y-auto"
                placeholder="Enter system prompt..."
              />
            </div>
          )}
          <div className="flex items-center justify-between mt-2">
              <span className="text-gray-500">Model Host</span>
            <span className="font-medium">{remoteHost}</span>
            </div>
        </div>
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
  // Assign icon type based on model id
  const Icon = Sparkles;

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className={`flex items-center py-2 px-3 md:px-3 md:py-2 cursor-pointer transition-all duration-200 ${isSelected ? "bg-gradient-to-r from-gray-50 to-gray-100" : "hover:bg-gray-50"}`}
      onClick={onClick}
    >
      <div className={`p-2.5 rounded-lg mr-3 flex-shrink-0`}><Icon className="h-4 w-4 md:h-5 md:w-5" /></div>
      <div className="flex-1 min-w-0">
        <div className="flex font-medium text-sm md:text-md items-center hover:text-blue-500 truncate">
          {model.name} 
          <span className={`ml-1 text-[10px] font-normal px-[4px] rounded-sm uppercase ${
            model.producer === 'WIP' 
              ? 'bg-orange-500 text-white' 
              : 'bg-green-600 text-white'
          }`}>
            {model.producer}
          </span>
        </div>
        <div className="text-xs text-gray-500">
          <span className="bg-gray-100 text-[11px] py-[1px] px-1 rounded-sm">{model.desc}</span>
          <span className="bg-gray-100 text-[11px] py-[1px] px-1 rounded-sm mr-1 ml-1">{model.parameter}</span>
          <span className="bg-gray-100 text-[11px] py-[1px] px-1 rounded-sm">{model.size}</span>
        </div>
      </div>
      {/* Load/Reload Button */}
      <div className="ml-2 text-xs">
        {loadState === "loading" ? (
          <Button variant="ghost" size="sm" disabled className="shadow-none font-normal text-[10px] !flex-col items-center mr-[-9px] border-none rounded-none bg-transparent">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading</span>
          </Button>
        ) : loadState === "warm" ? (
          <Button variant="ghost" size="sm" disabled className="shadow-none font-normal text-[10px] !flex-col items-center mr-[-9px] border-none rounded-none bg-transparent">
            <Cog className="h-4 w-4 animate-spin" />
            <span>Warming up</span>
          </Button>
        ) : (
          <Button
            title={loadState === "not_loaded" ? "Download model and configuration files" : "Re-download model files (files already downloaded)" }
            variant={"ghost"}
            size="sm"
            className={loadState === "not_loaded" ? "shadow-none hover:shadow-none text-xs hover:cursor-pointer h-9 w-9 border-none rounded-none bg-transparent hover:bg-transparent" : "shadow-none text-gray-600 text-xs hover:cursor-pointer hover:bg-transparent transition-colors h-9 w-9 border-none rounded-none bg-transparent"}
            onClick={(e) => {
              e.stopPropagation();
              onLoad();
            }}
          >
            {loadState === "not_loaded" ? (
              <>
                <Download className="h-4 w-4" />
              </>
            ) : (
              <>
                <RefreshCcw className="h-4 w-4" />
              </>
            )}
          </Button>
        )}
      </div>
    </motion.div>
  );
}

interface BackendOptionProps {
  backend: { id: BackendType; name: string };
  isSelected: boolean;
  onClick: () => void;
}

function BackendOption({ backend, isSelected, onClick }: BackendOptionProps) {
  // Assign icon type based on backend id
  let Icon = Gpu;
  if (backend.id === "webnn-npu") Icon = Microchip;
  // Add more mappings as needed
  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className={`flex items-center p-3 md:p-3 rounded-lg cursor-pointer transition-all duration-200 mr-2 min-h-[68px] ${isSelected ? "bg-gradient-to-r from-gray-50 to-gray-100 border border-blue-200 shadow-sm" : "hover:bg-gray-50 border border-transparent"}`}
      onClick={onClick}
    >
      <div className={`p-2.5 rounded-lg mr-3 flex-shrink-0 ${isSelected ? "bg-white shadow-sm" : "bg-gray-100"}`}><Icon className="h-4 w-4 md:h-5 md:w-5" /></div>
      <div className="flex-1">
        <div className="font-medium text-sm md:text-base">{backend.name}</div>
        <div className="text-xs md:text-sm text-gray-500">Inference backend</div>
      </div>
    </motion.div>
  );
}

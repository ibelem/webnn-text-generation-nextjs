"use client"

import React from "react"
import { motion } from "framer-motion"
import type { ModelType, BackendType } from "@/lib/types"
import Image from 'next/image';
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Sparkles, Settings, Gpu, Microchip, Loader2, Download, Cog, RefreshCcw } from "lucide-react"
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
}: SidebarProps) {
  // Track model load state: { [modelId]: "not_loaded" | "loading" | "loaded" }
  const [modelLoadState, setModelLoadState] = React.useState<Record<string, "not_loaded" | "loading" | "warm" | "loaded">>({});

  // Listen for worker "ready", "loading", "reset" events to update modelLoadState and progress
  React.useEffect(() => {
    if (!workerRef.current) return;
    const currentWorker = workerRef.current;

    function onWorkerMessage(e: MessageEvent) {
      const { status, model_id, data, file, progress, total } = e.data;
      if (!model_id && status !== "initiate" && status !== "progress" && status !== "done") return;

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
        // File download completed
        setProgressItems?.((prev) =>
          (prev || []).filter((item) => item.file !== file)
        );
      } else if (status === "loaded" || status === "ready") {
        setModelLoadState((prev) => ({ ...prev, [model_id]: "loaded" }));
        setProgressItems?.([]); // Clear all progress when model is ready
      } else if (status === "warm") {
        setModelLoadState((prev) => ({ ...prev, [model_id]: "warm" }));
      } else if (status === "reset") {
        setModelLoadState((prev) => ({ ...prev, [model_id]: "not_loaded" }));
        setProgressItems?.([]);
      }
    }

    currentWorker.addEventListener("message", onWorkerMessage);
    return () => {
      currentWorker.removeEventListener("message", onWorkerMessage);
    };
  }, [setProgressItems, workerRef]);

  // Handler for load/reload button
  const handleLoadModel = (modelId: string) => {
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
    <div className="h-full flex flex-col bg-white p-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-2">
          <Image
            src="/webgpu-logo.svg"
            alt="WebGPU Logo"
            width={36}
            height={36}
            className=""
          />
          <Image
            src="/webnn-logo.svg"
            alt="WebNN Logo"
            width={140}
            height={40}
            className=""
            style={{ width: '140px', height: '40px' }}
            priority
          />
        </div>
        <Button variant="ghost" size="icon">
          <Settings className="h-5 w-5" />
        </Button>
      </div>

      <Tabs defaultValue="models" className="flex-1">
        <TabsList className="grid grid-cols-2 px-2 gap-x-2 mb-2 h-[auto] w-full rounded-md bg-gray-100 border border-gray-200 shadow-xs">

          <TabsTrigger className="flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors
    data-[state=active]:bg-white border-none !shadow-none hover:cursor-pointer
    data-[state=inactive]:text-gray-500 hover:bg-white/80 focus:outline-none"
            value="models"> 
            Models
          </TabsTrigger>
          <TabsTrigger className="flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors
    data-[state=active]:bg-white border-none !shadow-none hover:cursor-pointer
    data-[state=inactive]:text-gray-500 hover:bg-white/80 focus:outline-none"
            value="backends">
            Backends
          </TabsTrigger>
        </TabsList>

        <TabsContent value="models" className="space-y-2">
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

      <div className="mt-auto pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs text-gray-500">Current Configuration</div>
        </div>
        <div className="bg-gray-100 rounded-md p-3 text-sm mb-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-500">Model</span>
            <span className="font-medium">
              {MODELS.find((m) => m.id === selectedModel)?.name || selectedModel}
            </span>
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-500">Backend</span>
            <span className="font-medium">{selectedBackend}</span>
          </div>
          {/* Reasoning toggle UI */}
          <div className="flex items-center justify-between">
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
      </div>
    </div>
  )
}

interface ModelOptionProps {
  model: { id: ModelType; name: string; desc: string };
  isSelected: boolean;
  onClick: () => void;
  loadState: "not_loaded" | "loading" | "warm" | "loaded";
  onLoad: () => void;
}

function ModelOption({ model, isSelected, onClick, loadState, onLoad }: ModelOptionProps) {
  // Assign icon type based on model id
  const Icon = Sparkles;

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`flex items-center p-3 rounded-md cursor-pointer transition-all duration-200 ${isSelected ? "bg-gradient-to-r from-gray-50 to-gray-100 border border-blue-200" : "hover:bg-gray-100"
        }`}
      onClick={onClick}
    >
      <div className={`p-2 rounded-md mr-3 ${isSelected ? "bg-gray-100" : "bg-gray-50"}`}><Icon className="h-4 w-4" /></div>
      <div className="flex-1">
        <div className="font-medium">{model.name}</div>
        <div className="text-xs text-gray-500">{model.desc}</div>
      </div>
      {/* Load/Reload Button */}
      <div className="ml-2 text-xs">
        {loadState === "loading" ? (
          <Button variant="secondary" size="sm" disabled className="font-normal text-xs">
            <Loader2 className="h-4 w-4 animate-spin mr-1" />
            Loading
          </Button>
        ) : loadState === "warm" ? (
          <Button variant="secondary" size="sm" disabled className="font-normal text-xs">
            <Cog className="h-4 w-4 animate-spin mr-1" />
            Warming up
          </Button>
        ) : (
          <Button
            title={loadState === "not_loaded" ? "Download model and configuration files" : "Re-download model files (files already downloaded)" }
            variant={loadState === "not_loaded" ? "default" : "secondary"}
            size="sm"
            className={loadState === "not_loaded" ? "bg-blue-500 text-white text-xs hover:cursor-pointer" : "bg-gray-200 text-gray-600 text-xs hover:cursor-pointer"}
            onClick={(e) => {
              e.stopPropagation();
              onLoad();
            }}
          >
            {loadState === "not_loaded" ? (
              <>
                <Download className="h-4 w-4" />
                Load
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
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`flex items-center p-3 rounded-md cursor-pointer transition-all duration-200 ${isSelected ? "bg-gradient-to-r from-gray-50 to-gray-100 border border-blue-200" : "hover:bg-gray-100"
        }`}
      onClick={onClick}
    >
      <div className={`p-2 rounded-md mr-3 ${isSelected ? "bg-gray-100" : "bg-gray-50"}`}><Icon className="h-4 w-4" /></div>
      <div className="flex-1">
        <div className="font-medium">{backend.name}</div>
        <div className="text-xs text-gray-500">Inference backend</div>
      </div>
    </motion.div>
  );
}
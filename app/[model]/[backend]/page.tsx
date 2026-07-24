"use client"

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { ChatInterface } from "@/components/chat-interface";
import { LiveVideoPanel } from "@/components/media-input/live-video-panel";
import type { ModelType, BackendType } from "@/lib/types";
import type { ProgressProps } from "@/components/progress";
import { MODELS, BACKENDS, DEFAULT_SYSTEM_PROMPT } from "@/lib/constants";
import { Loader2 } from "lucide-react";

export default function Page({ params }: { params: Promise<{ model: string; backend: string }> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { model, backend } = React.use(params);

  // Validate params
  const validModel = MODELS.some((m) => m.id === model);
  const validBackend = BACKENDS.some((b) => b.id === backend);

  // Fallback to defaults if invalid
  const [selectedModel, setSelectedModel] = useState<ModelType>(
    validModel ? (model as ModelType) : "qwen3-0_6b"
  );
  const [selectedBackend, setSelectedBackend] = useState<BackendType>(
    validBackend ? (backend as BackendType) : "webgpu"
  );
  const [progressItems, setProgressItems] = useState<ProgressProps[]>([]);
  const [workerReady, setWorkerReady] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  // Sidebar open state (starts open, then adjusts based on screen size)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Adjust sidebar state based on screen size after mount (avoid hydration mismatch)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsSidebarOpen(window.innerWidth >= 768);
    }
  }, []);

  // Reasoning feature toggle
  const [reasonEnabled, setReasonEnabled] = useState(false);

  // Writing Assistant feature toggle
  const [systemPromptEnabled, setSystemPromptEnabled] = useState(
    searchParams.get("system_prompt") === "true"
  );

  // System Prompt text
  const [systemPromptText, setSystemPromptText] = useState(DEFAULT_SYSTEM_PROMPT);

  // Token length parameters (similar to benchmark -l and -g flags)
  const VALID_TOKEN_OPTIONS = [0, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768];
  const parseTokenParam = (value: string | null) => {
    const n = parseInt(value ?? "", 10);
    return VALID_TOKEN_OPTIONS.includes(n) ? n : 0;
  };
  const [maxOutputTokens, setMaxOutputTokens] = useState<number>(() => parseTokenParam(searchParams.get("max_output_tokens")));
  const [maxInputTokens, setMaxInputTokens] = useState<number>(() => parseTokenParam(searchParams.get("max_input_tokens")));

  // Model load state
  const [modelLoadState, setModelLoadState] = useState<Record<string, "not_loaded" | "loading" | "warm" | "loaded" | "ready">>({});

  // Initialize worker once
  useEffect(() => {
    if (typeof window === "undefined") return
    if (!workerRef.current) {
      const workerPath =
        process.env.NODE_ENV === "development"
          ? new URL("../../../lib/model-worker.js", import.meta.url)
          : "/model-worker.bundle.js";

      workerRef.current = new Worker(workerPath, { type: "module" })
      window.chatWorkerRef = workerRef
      setWorkerReady(true)
    }

    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
      setWorkerReady(false)
    }
  }, [])
  
  useEffect(() => {
    if (validModel && selectedModel !== model) setSelectedModel(model as ModelType);
    if (validBackend && selectedBackend !== backend) setSelectedBackend(backend as BackendType);
  }, [model, backend, validModel, selectedModel, validBackend, selectedBackend]);

  // Sync systemPromptEnabled from URL → state (e.g. navigating with ?system_prompt=true)
  useEffect(() => {
    const urlValue = searchParams.get("system_prompt") === "true";
    if (urlValue !== systemPromptEnabled) {
      setSystemPromptEnabled(urlValue);
    }
    const urlMaxOutput = parseTokenParam(searchParams.get("max_output_tokens"));
    if (urlMaxOutput !== maxOutputTokens) {
      setMaxOutputTokens(urlMaxOutput);
    }
    const urlMaxInput = parseTokenParam(searchParams.get("max_input_tokens"));
    if (urlMaxInput !== maxInputTokens) {
      setMaxInputTokens(urlMaxInput);
    }
    // Only react to URL changes, not state changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Sync state → URL whenever model, backend, or systemPromptEnabled changes
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (systemPromptEnabled) {
      params.set("system_prompt", "true");
    } else {
      params.delete("system_prompt");
    }

    if (maxOutputTokens > 0) {
      params.set("max_output_tokens", String(maxOutputTokens));
    } else {
      params.delete("max_output_tokens");
    }

    if (maxInputTokens > 0) {
      params.set("max_input_tokens", String(maxInputTokens));
    } else {
      params.delete("max_input_tokens");
    }

    // Strip ?mode=live when switching to a model that doesn't support video
    const modelObj = MODELS.find((m) => m.id === selectedModel);
    const modelSupportsVideo = modelObj?.capabilities?.includes("video") ?? false;
    if (params.get("mode") === "live" && !modelSupportsVideo) {
      params.delete("mode");
    }

    const currentPath = `/${selectedModel}/${selectedBackend}`;
    const newSearch = params.toString();
    const newUrl = newSearch ? `${currentPath}?${newSearch}` : currentPath;

    // Avoid unnecessary navigation
    const currentUrl = `/${model}/${backend}${window.location.search}`;
    if (newUrl !== currentUrl) {
      router.replace(newUrl);
    }
  }, [selectedModel, selectedBackend, model, backend, systemPromptEnabled, maxOutputTokens, maxInputTokens, searchParams, router]);

  // After a cross-model navigation the sidebar stores the target model id in
  // sessionStorage. Pick it up here once the fresh worker is ready and fire the load.
  useEffect(() => {
    if (!workerReady) return;
    const pendingModelId = sessionStorage.getItem("pendingAutoLoad");
    if (!pendingModelId || pendingModelId !== selectedModel) return;
    sessionStorage.removeItem("pendingAutoLoad");
    const modelObj = MODELS.find((m) => m.id === pendingModelId);
    if (!modelObj) return;
    setModelLoadState((prev) => ({ ...prev, [pendingModelId]: "loading" }));
    workerRef.current?.postMessage({
      type: "setConfig",
      model_id: pendingModelId,
      data_type: modelObj.dataType,
      device: selectedBackend,
    });
    workerRef.current?.postMessage({ type: "load" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerReady]);

  // Auto-close sidebar on mobile after model is compiled (loaded state)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      const anyLoaded = Object.values(modelLoadState).includes("loaded") || Object.values(modelLoadState).includes("ready");
      if (anyLoaded) {
        const timer = setTimeout(() => {
          setIsSidebarOpen(false);
        }, 800);
        return () => clearTimeout(timer);
      }
    }
  }, [modelLoadState]);

  // Live video mode — switch to continuous inference UI
  const isLiveMode = searchParams.get("mode") === "live";
  // Check if current model supports live video
  const currentModelObj = MODELS.find((m) => m.id === selectedModel);
  const supportsLive = currentModelObj?.capabilities?.includes("video") ?? false;

  const handleModeChange = (live: boolean) => {
    const params = new URLSearchParams(searchParams.toString());
    if (live) {
      params.set("mode", "live");
    } else {
      params.delete("mode");
    }
    const newSearch = params.toString();
    const path = `/${selectedModel}/${selectedBackend}`;
    router.replace(newSearch ? `${path}?${newSearch}` : path);
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen md:h-screen bg-gray-50">
      {/* Skip link — keyboard users can jump past the sidebar */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:text-xs focus:font-medium focus:bg-white focus:text-blue-600 focus:rounded-md focus:shadow-md focus:border focus:border-blue-200"
      >
        Skip to main content
      </a>
      {isSidebarOpen && (
        workerReady ? (
          <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-gray-200/60 bg-white max-h-[85dvh] overflow-y-auto md:max-h-none md:h-full md:overflow-y-auto flex-shrink-0 sidebar-enter">
            <Sidebar
              selectedModel={selectedModel}
              setSelectedModel={setSelectedModel}
              selectedBackend={selectedBackend}
              setSelectedBackend={setSelectedBackend}
              progressItems={progressItems}
              setProgressItems={setProgressItems}
              workerRef={workerRef}
              reasonEnabled={reasonEnabled}
              setReasonEnabled={setReasonEnabled}
              systemPromptEnabled={systemPromptEnabled}
              setSystemPromptEnabled={setSystemPromptEnabled}
              systemPromptText={systemPromptText}
              setSystemPromptText={setSystemPromptText}
              maxOutputTokens={maxOutputTokens}
              setMaxOutputTokens={setMaxOutputTokens}
              maxInputTokens={maxInputTokens}
              setMaxInputTokens={setMaxInputTokens}
              modelLoadState={modelLoadState}
              setModelLoadState={setModelLoadState}
              setIsSidebarOpen={setIsSidebarOpen}
            />
          </div>
        ) : (
          <div className="w-full md:w-80 flex items-center justify-center bg-white h-20 md:h-full border-b md:border-b-0 md:border-r border-gray-200/60 sidebar-enter">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            <span className="ml-2 text-sm text-gray-400">Initializing...</span>
          </div>
        )
      )}
      <div id="main-content" className="flex-1 flex flex-col min-h-screen md:min-h-0 min-w-0">
        {isLiveMode && supportsLive ? (
          <LiveVideoPanel
            isSidebarOpen={isSidebarOpen}
            setIsSidebarOpen={setIsSidebarOpen}
            selectedModel={selectedModel}
            selectedBackend={selectedBackend}
            workerRef={workerRef}
            modelLoadState={modelLoadState}
            setProgressItems={setProgressItems}
            supportsLive={supportsLive}
            onModeChange={handleModeChange}
          />
        ) : (
          <ChatInterface
            isSidebarOpen={isSidebarOpen}
            setIsSidebarOpen={setIsSidebarOpen}
            selectedModel={selectedModel}
            selectedBackend={selectedBackend}
            setProgressItems={setProgressItems}
            workerRef={workerRef}
            reasonEnabled={reasonEnabled}
            setReasonEnabled={setReasonEnabled}
            systemPromptEnabled={systemPromptEnabled}
            systemPromptText={systemPromptText}
            maxOutputTokens={maxOutputTokens}
            maxInputTokens={maxInputTokens}
            modelLoadState={modelLoadState}
            supportsLive={supportsLive}
            onModeChange={handleModeChange}
          />
        )}
      </div>
    </div>
  );
}

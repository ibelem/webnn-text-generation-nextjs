"use client"

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { ChatInterface } from "@/components/chat-interface";
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

    const currentPath = `/${selectedModel}/${selectedBackend}`;
    const newSearch = params.toString();
    const newUrl = newSearch ? `${currentPath}?${newSearch}` : currentPath;

    // Avoid unnecessary navigation
    const currentUrl = `/${model}/${backend}${window.location.search}`;
    if (newUrl !== currentUrl) {
      router.replace(newUrl);
    }
  }, [selectedModel, selectedBackend, model, backend, systemPromptEnabled, searchParams, router]);

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

  return (
    <div className="flex flex-col md:flex-row min-h-screen md:h-screen bg-gray-100">
      {isSidebarOpen && (
        workerReady ? (
          <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-gray-200 bg-white md:h-full md:overflow-y-auto">
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
              modelLoadState={modelLoadState}
              setModelLoadState={setModelLoadState}
              setIsSidebarOpen={setIsSidebarOpen}
            />
          </div>
        ) : (
          <div className="w-full md:w-80 flex items-center justify-center bg-white h-20 md:h-full border-b md:border-b-0 md:border-r border-gray-200">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="ml-2">Initializing Workers...</span>
          </div>
        )
      )}
      <div className="flex-1 flex flex-col min-h-screen md:min-h-0">
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
          modelLoadState={modelLoadState}
        />
      </div>
    </div>
  );
}

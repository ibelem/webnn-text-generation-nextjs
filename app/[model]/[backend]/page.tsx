"use client"

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { ChatInterface } from "@/components/chat-interface";
import type { ModelType, BackendType } from "@/lib/types";
import type { ProgressProps } from "@/components/progress";
import { MODELS, BACKENDS, WRITING_ASSISTANT_PROMPT } from "@/lib/constants";
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
    validModel ? (model as ModelType) : "phi-3_5-mini"
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
  const [writingAssistantEnabled, setWritingAssistantEnabled] = useState(
    searchParams.get("assistant") === "true"
  );

  // Writing Assistant Prompt
  const [writingAssistantPrompt, setWritingAssistantPrompt] = useState(WRITING_ASSISTANT_PROMPT);

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

  // Update URL when selection changes
  useEffect(() => {
    // Only update URL if model or backend actually changed from current URL
    if (model !== selectedModel || backend !== selectedBackend) {
      const params = new URLSearchParams(searchParams.toString());
      if (writingAssistantEnabled) {
        params.set("assistant", "true");
      } else {
        params.delete("assistant");
      }

      const currentPath = `/${selectedModel}/${selectedBackend}`;
      const newSearch = params.toString();
      const newUrl = newSearch ? `${currentPath}?${newSearch}` : currentPath;

      router.replace(newUrl);
    }
  }, [selectedModel, selectedBackend, model, backend, writingAssistantEnabled, router]);
    // eslint-disable-next-line react-hooks/exhaustive-deps

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
    <div className="flex h-screen bg-gray-100">
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/40 z-40 md:hidden backdrop-blur-sm transition-opacity duration-200"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
      
      {isSidebarOpen && (
        workerReady ? (
          <div className="fixed md:relative inset-0 md:inset-auto w-[96%] md:w-80 border-r border-gray-200 bg-white h-full z-50 md:z-auto shadow-xl md:shadow-none transition-transform duration-200 ease-out">
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
              writingAssistantEnabled={writingAssistantEnabled}
              setWritingAssistantEnabled={setWritingAssistantEnabled}
              writingAssistantPrompt={writingAssistantPrompt}
              setWritingAssistantPrompt={setWritingAssistantPrompt}
              modelLoadState={modelLoadState}
              setModelLoadState={setModelLoadState}
              setIsSidebarOpen={setIsSidebarOpen}
            />
          </div>
        ) : (
          <div className="fixed md:relative inset-0 md:inset-auto w-[85%] max-w-[320px] md:w-80 flex items-center justify-center bg-white h-full z-50 md:z-auto shadow-xl md:shadow-none">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="ml-2">Initializing Workers...</span>
          </div>
        )
      )}
      <div className="flex-1 flex flex-col">
        <ChatInterface
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={setIsSidebarOpen}
          selectedModel={selectedModel}
          selectedBackend={selectedBackend}
          setProgressItems={setProgressItems}
          workerRef={workerRef}
          reasonEnabled={reasonEnabled}
          setReasonEnabled={setReasonEnabled}
          writingAssistantEnabled={writingAssistantEnabled}
          writingAssistantPrompt={writingAssistantPrompt}
          modelLoadState={modelLoadState}
        />
      </div>
    </div>
  );
}

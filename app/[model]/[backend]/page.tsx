"use client"

import React from "react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { ChatInterface } from "@/components/chat-interface";
import type { ModelType, BackendType } from "@/lib/types";
import type { ProgressProps } from "@/components/progress";
import { MODELS, BACKENDS } from "@/lib/constants";
import { Loader2 } from "lucide-react";

export default function Page({ params }: { params: Promise<{ model: string; backend: string }> }) {
  const router = useRouter();
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

  // Sidebar open state
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Reasoning feature toggle
  const [reasonEnabled, setReasonEnabled] = useState(false);

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
      setWorkerReady(true) // <-- Set ready here!
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
    // eslint-disable-next-line
  }, [model, backend]);

  // Update URL when selection changes
  useEffect(() => {
    if (selectedModel !== model || selectedBackend !== backend) {
      router.replace(`/${selectedModel}/${selectedBackend}`);
    }
    // eslint-disable-next-line
  }, [selectedModel, selectedBackend]);

  // ...worker setup code (same as before)...

  return (
    <div className="flex h-screen bg-gray-100">
      {isSidebarOpen && (
        workerReady ? (
          <div className="w-80 border-r border-gray-200 bg-white">
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
              modelLoadState={modelLoadState}
              setModelLoadState={setModelLoadState}
            />
          </div>
        ) : (
          <div className="w-80 flex items-center justify-center">
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
          modelLoadState={modelLoadState}
        />
      </div>
    </div>
  );
}
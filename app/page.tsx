"use client"

import { useState, useRef, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { ChatInterface } from "@/components/chat-interface"
import type { ModelType, BackendType } from "@/lib/types"
import type { ProgressProps } from "@/components/progress"
import { MODELS } from "@/lib/constants"
import { Loader2 } from "lucide-react"

export default function Page() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [selectedModel, setSelectedModel] = useState<ModelType>("phi-3_5-mini")
  const [selectedBackend, setSelectedBackend] = useState<BackendType>("webgpu")
  const [progressItems, setProgressItems] = useState<ProgressProps[]>([])
  const [workerReady, setWorkerReady] = useState(false)

  // Create worker at the top level
  const workerRef = useRef<Worker | null>(null)

  // Initialize worker once
  useEffect(() => {
    if (typeof window === "undefined") return
    if (!workerRef.current) {
      workerRef.current = new Worker("/model-worker.bundle.js", { type: "module" })
      window.chatWorkerRef = workerRef
      setWorkerReady(true) // <-- Set ready here!
    }

    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
      setWorkerReady(false)
    }
  }, [])

  // Send config when model/backend changes
  useEffect(() => {
    if (!workerRef.current) return
    const selectedModelObj = MODELS.find((m) => m.id === selectedModel)
    if (!selectedModelObj) return

    workerRef.current.postMessage({
      type: "setConfig",
      model_id: selectedModel,
      data_type: selectedModelObj.dataType,
      device: selectedBackend,
    })
  }, [selectedModel, selectedBackend])

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
          workerRef={workerRef} // Pass worker ref
        />
      </div>
    </div>
  )
}

"use client"

import React, { useRef, useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Play, Square, Video, Upload, Loader2, Menu, X, AlertCircle } from "lucide-react"
import type { ModelType, BackendType } from "@/lib/types"
import { MODELS, BACKENDS } from "@/lib/constants"
import type { ProgressProps } from "@/components/progress"

const CAPTURE_MAX_WIDTH = 800;

interface LiveVideoPanelProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  selectedModel: ModelType;
  selectedBackend: BackendType;
  workerRef: React.RefObject<Worker | null>;
  modelLoadState: Record<string, "not_loaded" | "loading" | "warm" | "loaded" | "ready">;
  setProgressItems?: React.Dispatch<React.SetStateAction<ProgressProps[]>>;
}

export function LiveVideoPanel({
  isSidebarOpen,
  setIsSidebarOpen,
  selectedModel,
  selectedBackend,
  workerRef,
  modelLoadState,
  setProgressItems,
}: LiveVideoPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [instruction, setInstruction] = useState("Briefly describe what you see (2 sentences max).");
  const [response, setResponse] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPrefilling, setIsPrefilling] = useState(false);
  const [sourceMode, setSourceMode] = useState<"webcam" | "file">("webcam");
  const [stream, setStreamState] = useState<MediaStream | null>(null);
  const [fileObjectUrl, setFileObjectUrl] = useState<string | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);

  const isProcessingRef = useRef(false);
  const anyModelReady = Object.values(modelLoadState).includes("ready");

  const selectedModelObj = MODELS.find((m) => m.id === selectedModel);
  const selectedModelName = selectedModelObj
    ? `${selectedModelObj.name} ${selectedModelObj.parameter}`
    : selectedModel;
  const backendName = BACKENDS.find((b) => b.id === selectedBackend)?.name || selectedBackend;

  // Cleanup streams on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      if (fileObjectUrl) {
        URL.revokeObjectURL(fileObjectUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initCamera = useCallback(async () => {
    try {
      setResponse("Requesting camera access...");
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });

      // Clean up previous
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (fileObjectUrl) {
        URL.revokeObjectURL(fileObjectUrl);
        setFileObjectUrl(null);
      }

      const video = videoRef.current;
      if (video) {
        video.removeAttribute("src");
        video.srcObject = mediaStream;
      }
      setStreamState(mediaStream);
      setSourceMode("webcam");
      setResponse(anyModelReady ? "Camera ready. Click Start to begin." : "Camera ready. Load a model from the sidebar to start.");
      return true;
    } catch (err) {
      const error = err as DOMException;
      console.error("Error accessing camera:", error);
      setResponse(`Error accessing camera: ${error.name} - ${error.message}. You can use a video file instead.`);
      return false;
    }
  }, [stream, fileObjectUrl, anyModelReady]);

  const switchToVideoFile = useCallback(
    async (file: File) => {
      // Stop webcam
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        setStreamState(null);
      }
      if (fileObjectUrl) {
        URL.revokeObjectURL(fileObjectUrl);
      }

      const url = URL.createObjectURL(file);
      setFileObjectUrl(url);
      setSourceMode("file");
      setIsVideoReady(false);

      const video = videoRef.current;
      if (video) {
        video.srcObject = null;
        video.src = url;
        video.loop = true;
        video.muted = true;
        try {
          await video.play();
        } catch (err) {
          console.warn("Autoplay blocked:", err);
        }
      }
      setResponse(`Using video file: ${file.name}`);
    },
    [stream, fileObjectUrl]
  );

  // Track video readiness via loadeddata event
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onLoadedData = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        setIsVideoReady(true);
      }
    };

    // Check if already ready
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      setIsVideoReady(true);
    }

    video.addEventListener("loadeddata", onLoadedData);
    return () => video.removeEventListener("loadeddata", onLoadedData);
  }, [stream, fileObjectUrl]);

  // Listen for worker responses in live mode
  useEffect(() => {
    if (!workerRef.current) return;
    const currentWorker = workerRef.current;

    const onMessage = (e: MessageEvent) => {
      const { status, output } = e.data;
      if (status === "update") {
        setIsPrefilling(false);
        setResponse((prev) => prev + output);
      } else if (status === "start") {
        setResponse("");
        setIsPrefilling(true);
      } else if (status === "complete") {
        setIsPrefilling(false);
        // After completion, if still processing, trigger next frame
        if (isProcessingRef.current) {
          captureAndInfer();
        }
      } else if (status === "error") {
        setIsPrefilling(false);
        setResponse(`Error: ${e.data.data}`);
        isProcessingRef.current = false;
        setIsProcessing(false);
      }
    };

    currentWorker.addEventListener("message", onMessage);
    return () => currentWorker.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerRef.current]);

  // Initialize camera on mount — don't wait for model to be ready
  useEffect(() => {
    if (!stream && !fileObjectUrl) {
      initCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const captureImage = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) {
      return null;
    }

    const scale = Math.min(1, CAPTURE_MAX_WIDTH / video.videoWidth);
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  }, []);

  const captureAndInfer = useCallback(() => {
    if (!isProcessingRef.current) return;

    const imageDataUrl = captureImage();
    if (!imageDataUrl) {
      setResponse("Capture failed — video not ready.");
      return;
    }

    setResponse("");
    workerRef.current?.postMessage({
      type: "generate",
      data: {
        messages: [{ role: "user", content: instruction }],
        reasonEnabled: false,
        systemPromptEnabled: false,
        systemPromptText: "",
        images: [imageDataUrl],
      },
    });
  }, [captureImage, instruction, workerRef]);

  const handleStart = () => {
    if (!anyModelReady) {
      setResponse("Model not ready. Please load a model from the sidebar first.");
      return;
    }

    const video = videoRef.current;
    if (!video || video.videoWidth === 0) {
      setResponse("Video source not ready. Please allow camera access or upload a video file.");
      return;
    }

    isProcessingRef.current = true;
    setIsProcessing(true);
    setResponse("Processing started...");
    captureAndInfer();
  };

  const handleStop = () => {
    isProcessingRef.current = false;
    setIsProcessing(false);
    setIsPrefilling(false);
    workerRef.current?.postMessage({ type: "interrupt" });
  };

  const handleSourceToggle = async () => {
    if (sourceMode === "webcam") {
      fileInputRef.current?.click();
    } else {
      setIsVideoReady(false);
      await initCamera();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await switchToVideoFile(file);
    e.target.value = "";
  };

  // Determine button disabled state and helper text
  const canStart = anyModelReady && isVideoReady;
  const statusHint = !anyModelReady
    ? "Load a model from the sidebar to start"
    : !isVideoReady
      ? "Waiting for video source..."
      : null;

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 md:px-4 md:py-3 border-b border-gray-200/80 bg-white/80 backdrop-blur-sm">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="h-9 w-9 md:h-10 md:w-10 flex-shrink-0 rounded-md hover:bg-gray-100 hover:cursor-pointer transition-colors"
          aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
        >
          {isSidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </Button>
        <div className="flex items-center gap-2 overflow-hidden px-2">
          <div className="h-7 w-7 flex items-center justify-center flex-shrink-0">
            <Video className="h-3.5 w-3.5 text-rose-500" />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2 overflow-hidden">
            <span className="font-semibold text-xs sm:text-sm md:text-base truncate text-gray-800">
              {selectedModelName} · Live
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-gray-300 hidden sm:inline">·</span>
              <span className="text-[10px] sm:text-xs md:text-sm text-gray-400 truncate">{backendName}</span>
            </div>
          </div>
        </div>
        <div className="w-9 md:w-10 flex-shrink-0" />
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-3 md:p-6 flex flex-col items-center gap-4 bg-gradient-to-b from-gray-50 to-white">
        {/* Video container */}
        <div className="relative w-full max-w-[640px] aspect-video bg-black rounded-xl overflow-hidden border border-gray-200 shadow-lg group">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover rounded-xl"
          />

          {/* Source toggle — visible on hover */}
          <button
            type="button"
            onClick={handleSourceToggle}
            disabled={isProcessing}
            className="absolute top-2.5 left-2.5 z-10 px-2.5 py-1.5 text-[11px] font-semibold text-white bg-black/60 hover:bg-black/75 rounded-full border border-white/20 backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {sourceMode === "webcam" ? (
              <span className="flex items-center gap-1"><Upload className="h-3 w-3" /> Use video file</span>
            ) : (
              <span className="flex items-center gap-1"><Video className="h-3 w-3" /> Use webcam</span>
            )}
          </button>

          {/* Prefill indicator */}
          {isPrefilling && (
            <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1.5 px-2.5 py-1.5 bg-black/60 text-white text-[11px] font-semibold rounded-full backdrop-blur-sm">
              <Loader2 className="h-3 w-3 animate-spin" />
              Processing image
            </div>
          )}

          {/* Overlay: model not loaded */}
          {!anyModelReady && !isProcessing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-[2px] z-10 rounded-xl">
              <AlertCircle className="h-8 w-8 text-amber-400 mb-2" />
              <span className="text-white text-sm font-semibold">Model not loaded</span>
              <span className="text-white/70 text-xs mt-1">Open the sidebar and load a model to begin</span>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* Controls */}
        <div className="w-full max-w-[640px] bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-end">
            <div className="flex-1 space-y-1">
              <label htmlFor="live-instruction" className="text-xs font-semibold text-gray-500">
                Instruction
              </label>
              <Textarea
                id="live-instruction"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                disabled={isProcessing}
                className="min-h-[40px] max-h-[100px] resize-none text-sm border-gray-200 focus:border-blue-300"
                rows={1}
              />
            </div>
            <div className="flex-shrink-0">
              {isProcessing ? (
                <Button
                  onClick={handleStop}
                  className="w-full sm:w-auto bg-red-500 hover:bg-red-600 text-white font-semibold px-5 py-2 rounded-lg hover:cursor-pointer"
                >
                  <Square className="h-4 w-4 mr-1.5" /> Stop
                </Button>
              ) : (
                <Button
                  onClick={handleStart}
                  disabled={!canStart}
                  className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-semibold px-5 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:cursor-pointer"
                >
                  <Play className="h-4 w-4 mr-1.5" /> Start
                </Button>
              )}
            </div>
          </div>

          {/* Status hint when button is disabled */}
          {statusHint && !isProcessing && (
            <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 rounded-md px-3 py-2 border border-amber-200/60">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              {statusHint}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500">Response</label>
            <div className="min-h-[60px] max-h-[150px] overflow-y-auto rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5 text-sm text-gray-700 whitespace-pre-wrap break-words">
              {response || <span className="text-gray-300">Response will appear here...</span>}
            </div>
          </div>
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </>
  );
}

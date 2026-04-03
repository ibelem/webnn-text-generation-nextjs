"use client"

import React, { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { ImagePlus, Camera, Film, Aperture, FileText, X, Mic, MicOff, Music } from "lucide-react"
import type { ModelCapability } from "@/lib/types"

/** Maximum dimension (width or height) for images sent to VLM models */
const IMAGE_MAX_DIM = 800;

/** A text-based file attachment */
export interface AttachedFile {
  name: string;
  content: string;
  /** size in bytes */
  size: number;
}

/** A decoded audio clip ready for model input */
export interface AttachedAudio {
  name: string;
  /** Duration in seconds */
  duration: number;
  /** Always 16000 — models expect 16kHz mono PCM */
  sampleRate: 16000;
  /** Raw mono PCM samples resampled to 16kHz */
  data: Float32Array;
}

interface AttachmentBarProps {
  /** Model capabilities — controls which buttons are shown */
  capabilities: ModelCapability[];
  /** Currently attached image data URLs */
  attachedImages: string[];
  /** Callback when images are added (receives data URLs) */
  onImagesAdded: (dataUrls: string[]) => void;
  /** Callback to remove an attached image by index */
  onImageRemoved: (index: number) => void;
  /** Currently attached text files */
  attachedFiles?: AttachedFile[];
  /** Callback when text files are added */
  onFilesAdded?: (files: AttachedFile[]) => void;
  /** Callback to remove an attached file by index */
  onFileRemoved?: (index: number) => void;
  /** Currently attached audio clip */
  attachedAudio?: AttachedAudio | null;
  /** Callback when an audio clip is attached */
  onAudioAdded?: (audio: AttachedAudio) => void;
  /** Callback to remove the attached audio clip */
  onAudioRemoved?: () => void;
  /** Whether the model is ready for input */
  disabled?: boolean;
}

/** Accepted text file extensions */
const TEXT_FILE_ACCEPT = ".txt,.md,.markdown,.json,.jsonl,.csv,.tsv,.xml,.yaml,.yml,.toml,.html,.htm,.css,.js,.ts,.jsx,.tsx,.py,.java,.c,.cpp,.h,.hpp,.rs,.go,.rb,.sh,.bat,.ps1,.log,.env,.ini,.cfg,.conf,.sql,.graphql,.proto,.r,.swift,.kt,.scala,.lua,.pl,.php,.ex,.exs,.hs,.clj,.edn,.lisp,.dart,.diff,.patch";

export function AttachmentBar({
  capabilities,
  attachedImages,
  onImagesAdded,
  onImageRemoved,
  attachedFiles = [],
  onFilesAdded,
  onFileRemoved,
  attachedAudio,
  onAudioAdded,
  onAudioRemoved,
  disabled = false,
}: AttachmentBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textFileInputRef = useRef<HTMLInputElement>(null);
  const videoFileInputRef = useRef<HTMLInputElement>(null);
  const audioFileInputRef = useRef<HTMLInputElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const hasVision = capabilities.includes("vision") || capabilities.includes("video");
  const hasVideo = capabilities.includes("video");
  const hasAudio = capabilities.includes("audio");

  const [videoPreview, setVideoPreview] = useState<{ url: string; name: string } | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const dataUrls: string[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const dataUrl = await fileToDataUrl(file);
      const resized = await resizeImageDataUrl(dataUrl, IMAGE_MAX_DIM);
      dataUrls.push(resized);
    }
    if (dataUrls.length > 0) {
      onImagesAdded(dataUrls);
    }
    // Reset input so same file can be selected again
    e.target.value = "";
  };

  const handleWebcamCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const video = document.createElement("video");
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      await video.play();

      // Wait for video to have dimensions
      await new Promise<void>((resolve) => {
        const check = () => {
          if (video.videoWidth > 0 && video.videoHeight > 0) {
            resolve();
          } else {
            requestAnimationFrame(check);
          }
        };
        check();
      });

      const canvas = document.createElement("canvas");
      const maxWidth = 800;
      const scale = Math.min(1, maxWidth / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }

      // Stop the stream
      stream.getTracks().forEach((track) => track.stop());

      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      onImagesAdded([dataUrl]);
    } catch (err) {
      console.error("Camera capture failed:", err);
    }
  };

  const handleVideoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Clean up previous preview
    if (videoPreview) {
      URL.revokeObjectURL(videoPreview.url);
    }
    const url = URL.createObjectURL(file);
    setVideoPreview({ url, name: file.name });
    e.target.value = "";
  };

  const handleVideoFrameCapture = () => {
    const video = videoPreviewRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;

    const canvas = document.createElement("canvas");
    const maxWidth = 800;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    onImagesAdded([dataUrl]);
  };

  const closeVideoPreview = () => {
    if (videoPreview) {
      URL.revokeObjectURL(videoPreview.url);
      setVideoPreview(null);
    }
  };

  const handlePaste = (e: ClipboardEvent) => {
    if (!hasVision) return;
    const items = e.clipboardData?.items;
    if (!items) return;

    const dataUrls: Promise<string>[] = [];
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          dataUrls.push(fileToDataUrl(file));
        }
      }
    }
    if (dataUrls.length > 0) {
      Promise.all(dataUrls).then(async (urls) => {
        const resized = await Promise.all(urls.map((u) => resizeImageDataUrl(u, IMAGE_MAX_DIM)));
        onImagesAdded(resized);
      });
    }
  };

  const handleTextFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const attached: AttachedFile[] = [];
    for (const file of Array.from(files)) {
      try {
        const content = await file.text();
        attached.push({ name: file.name, content, size: file.size });
      } catch (err) {
        console.error(`Failed to read file ${file.name}:`, err);
      }
    }
    if (attached.length > 0) {
      onFilesAdded?.(attached);
    }
    e.target.value = "";
  };

  // ── Audio helpers ────────────────────────────────────────────────────────

  /** Decode any audio file/blob to a mono Float32Array at 16 kHz using the Web Audio API. */
  async function decodeAudioToFloat32(blob: Blob): Promise<{ data: Float32Array; duration: number }> {
    const arrayBuffer = await blob.arrayBuffer();
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const decodeCtx = new AudioCtx();
    const audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer);
    await decodeCtx.close();

    const TARGET_SAMPLE_RATE = 16000;
    const duration = audioBuffer.duration;
    const offlineCtx = new OfflineAudioContext(
      1,
      Math.ceil(duration * TARGET_SAMPLE_RATE),
      TARGET_SAMPLE_RATE
    );
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    // Mix down to mono by connecting all channels to a single channel merger
    const merger = offlineCtx.createChannelMerger(1);
    source.connect(merger);
    merger.connect(offlineCtx.destination);
    source.start(0);
    const resampled = await offlineCtx.startRendering();
    return { data: resampled.getChannelData(0), duration };
  }

  const handleAudioFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const { data, duration } = await decodeAudioToFloat32(file);
      onAudioAdded?.({ name: file.name, duration, sampleRate: 16000, data });
    } catch (err) {
      console.error("Failed to decode audio file:", err);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        try {
          const { data, duration } = await decodeAudioToFloat32(blob);
          onAudioAdded?.({ name: "microphone-recording", duration, sampleRate: 16000, data });
        } catch (err) {
          console.error("Failed to decode microphone recording:", err);
        }
      };

      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Microphone access denied or unavailable:", err);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setIsRecording(false);
  };

  // Listen for paste events on the document
  React.useEffect(() => {
    if (!hasVision) return;
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasVision]);

  // Clean up video preview on unmount
  React.useEffect(() => {
    return () => {
      if (videoPreview) {
        URL.revokeObjectURL(videoPreview.url);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stop mic stream if component unmounts while recording
  React.useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current = null;
      }
    };
  }, []);

  if (!hasVision && !hasAudio && !onFilesAdded) return null;

  return (
    <div className="flex flex-col gap-2">
      {/* Image previews */}
      {attachedImages.length > 0 && (
        <div className="flex flex-wrap gap-2 px-1">
          {attachedImages.map((src, i) => (
            <div key={i} className="relative group">
              <img
                src={src}
                alt={`Attachment ${i + 1}`}
                className="h-16 w-16 md:h-20 md:w-20 object-cover rounded-lg border border-gray-200 shadow-sm"
              />
              <button
                type="button"
                onClick={() => onImageRemoved(i)}
                className="absolute -top-1.5 -right-1.5 bg-gray-800 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                aria-label={`Remove image ${i + 1}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Text file previews */}
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-1">
          {attachedFiles.map((file, i) => (
            <div
              key={i}
              className="relative group flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-md px-2.5 py-1.5 shadow-sm"
            >
              <FileText className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] font-medium text-gray-600 truncate max-w-[140px]" title={file.name}>
                  {file.name}
                </span>
                <span className="text-[9px] text-gray-400">{formatFileSize(file.size)}</span>
              </div>
              <button
                type="button"
                onClick={() => onFileRemoved?.(i)}
                className="ml-1 bg-gray-800 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm flex-shrink-0"
                aria-label={`Remove ${file.name}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Video preview with frame capture */}
      {videoPreview && (
        <div className="flex items-start gap-2 px-1">
          <div className="relative group">
            <video
              ref={videoPreviewRef}
              src={videoPreview.url}
              controls
              playsInline
              muted
              className="h-24 w-40 object-cover rounded-lg border border-gray-200 shadow-sm bg-black"
            />
            <button
              type="button"
              onClick={closeVideoPreview}
              className="absolute -top-1.5 -right-1.5 bg-gray-800 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
              aria-label="Remove video"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <div className="flex flex-col gap-1.5 justify-center h-24">
            <span className="text-[10px] text-gray-400 truncate max-w-[120px]" title={videoPreview.name}>
              {videoPreview.name}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleVideoFrameCapture}
              className="h-7 px-2.5 text-[11px] font-semibold text-blue-600 border-blue-200 hover:bg-blue-50 hover:cursor-pointer rounded-md"
              title="Capture the current video frame as an image"
            >
              <Aperture className="h-3.5 w-3.5 mr-1" /> Capture frame
            </Button>
            <span className="text-[10px] text-gray-300">Play/scrub then capture</span>
          </div>
        </div>
      )}

      {/* Audio clip chip */}
      {attachedAudio && (
        <div className="flex flex-wrap gap-1.5 px-1">
          <div className="relative group flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-md px-2.5 py-1.5 shadow-sm">
            <Music className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] font-medium text-blue-700 truncate max-w-[160px]" title={attachedAudio.name}>
                {attachedAudio.name === "microphone-recording" ? "Microphone recording" : attachedAudio.name}
              </span>
              <span className="text-[9px] text-blue-400">{attachedAudio.duration.toFixed(1)}s · 16kHz mono</span>
            </div>
            <button
              type="button"
              onClick={onAudioRemoved}
              className="ml-1 bg-blue-700 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm flex-shrink-0"
              aria-label="Remove audio clip"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-1.5">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
        <input
          ref={videoFileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={handleVideoFileSelect}
        />
        <input
          ref={textFileInputRef}
          type="file"
          accept={TEXT_FILE_ACCEPT}
          multiple
          className="hidden"
          onChange={handleTextFileSelect}
        />
        {hasAudio && (
          <input
            ref={audioFileInputRef}
            type="file"
            accept=".mp3,.wav,.ogg,.m4a,.aac,.flac,.opus,.webm"
            className="hidden"
            onChange={handleAudioFileSelect}
          />
        )}
        {hasVision && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => fileInputRef.current?.click()}
            className="h-8 px-2.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50/50 hover:cursor-pointer rounded-md transition-colors"
            title="Attach image"
          >
            <ImagePlus className="h-4 w-4" />
            <span className="text-xs ml-1 hidden sm:inline">Image</span>
          </Button>
        )}
        {hasVision && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={handleWebcamCapture}
            className="h-8 px-2.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50/50 hover:cursor-pointer rounded-md transition-colors"
            title="Take photo from camera"
          >
            <Camera className="h-4 w-4" />
            <span className="text-xs ml-1 hidden sm:inline">Camera</span>
          </Button>
        )}
        {hasVideo && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => videoFileInputRef.current?.click()}
            className="h-8 px-2.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50/50 hover:cursor-pointer rounded-md transition-colors"
            title="Upload video and capture a frame"
          >
            <Film className="h-4 w-4" />
            <span className="text-xs ml-1 hidden sm:inline">Video</span>
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => textFileInputRef.current?.click()}
          className="h-8 px-2.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50/50 hover:cursor-pointer rounded-md transition-colors"
          title="Attach text file (.md, .json, .txt, .py, etc.)"
        >
          <FileText className="h-4 w-4" />
          <span className="text-xs ml-1 hidden sm:inline">File</span>
        </Button>
        {hasAudio && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || !!attachedAudio}
            onClick={() => audioFileInputRef.current?.click()}
            className="h-8 px-2.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50/50 hover:cursor-pointer rounded-md transition-colors"
            title="Attach audio file (.mp3, .wav, .ogg, etc.)"
          >
            <Music className="h-4 w-4" />
            <span className="text-xs ml-1 hidden sm:inline">Audio</span>
          </Button>
        )}
        {hasAudio && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || !!attachedAudio}
            onClick={isRecording ? stopRecording : startRecording}
            className={`h-8 px-2.5 hover:cursor-pointer rounded-md transition-colors ${
              isRecording
                ? "text-red-500 hover:text-red-600 hover:bg-red-50/50 animate-pulse"
                : "text-gray-400 hover:text-blue-500 hover:bg-blue-50/50"
            }`}
            title={isRecording ? "Stop recording" : "Record audio from microphone"}
          >
            {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            <span className="text-xs ml-1 hidden sm:inline">{isRecording ? "Stop" : "Record"}</span>
          </Button>
        )}
      </div>
    </div>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Resize an image data URL so its largest dimension is at most `maxDim` pixels.
 * Returns the original data URL unchanged if already within limits.
 */
function resizeImageDataUrl(dataUrl: string, maxDim: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img;
      if (w <= maxDim && h <= maxDim) {
        resolve(dataUrl);
        return;
      }
      const scale = Math.min(maxDim / w, maxDim / h);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      }
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => resolve(dataUrl); // fallback to original on error
    img.src = dataUrl;
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

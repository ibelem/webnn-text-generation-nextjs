"use client"

// Extend the Window interface for global properties
declare global {
  interface Window {
    chatWorkerRef?: React.MutableRefObject<Worker | null>;
    setProgressItems?: React.Dispatch<React.SetStateAction<ProgressProps[]>>;
  }
}

import React, { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import type { ModelType, BackendType, Message, MessageContentPart } from "../lib/types"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ArrowUp, Menu, X, User, Bot, Sparkles, Loader2, Copy, Check } from "lucide-react"
import { MODELS, BACKENDS } from "../lib/constants"
import { v4 as uuidv4 } from "uuid"
import packageJson from "../package.json"
import { AttachmentBar } from "@/components/media-input/attachment-bar"

/** Extract plain text from a Message's content (string or multimodal parts array) */
function getMessageText(content: string | MessageContentPart[]): string {
  if (typeof content === "string") return content;
  return content
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join("");
}

import type { ProgressProps } from "@/components/progress"

interface ChatInterfaceProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  selectedModel: ModelType;
  selectedBackend: BackendType;
  setProgressItems?: React.Dispatch<React.SetStateAction<ProgressProps[]>>;
  workerRef: React.RefObject<Worker | null>;
  reasonEnabled: boolean;
  setReasonEnabled: (enabled: boolean) => void;
  systemPromptEnabled: boolean;
  systemPromptText: string;
  modelLoadState: Record<string, "not_loaded" | "loading" | "warm" | "loaded" | "ready">;
}

export function ChatInterface({
  isSidebarOpen,
  setIsSidebarOpen,
  selectedModel,
  selectedBackend,
  setProgressItems,
  workerRef,
  reasonEnabled, // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setReasonEnabled,
  systemPromptEnabled,
  systemPromptText,
  modelLoadState,
}: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const anyModelReady = Object.values(modelLoadState).includes("ready");
  const selectedModelObj = MODELS.find((m) => m.id === selectedModel);
  const modelCapabilities = selectedModelObj?.capabilities ?? ["text"];

  // Expose workerRef and setProgressItems globally for Sidebar reset
  useEffect(() => {
    window.chatWorkerRef = workerRef;
    window.setProgressItems = setProgressItems;
    return () => {
      delete window.chatWorkerRef;
      delete window.setProgressItems;
    };
  }, [setProgressItems, workerRef]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Remove worker creation useEffect, use the passed workerRef instead
  useEffect(() => {
    if (!workerRef.current) return;

    // Capture the current worker reference
    const currentWorker = workerRef.current;

    const onMessage = (e: MessageEvent) => {
      switch (e.data.status) {
        case "update": {
          const { output, tps, numTokens, ttft, state } = e.data;
          setIsTyping(false);
          setMessages((prev) => {
            if (prev.length === 0) return prev;
            const cloned = [...prev];
            const last = cloned.at(-1);
            if (last && last.role === "assistant") {
              cloned[cloned.length - 1] = {
                ...last,
                content: last.content + output,
                tps,
                numTokens,
                ttft,
                state
              };
            } else {
              cloned.push({
                id: uuidv4(),
                role: "assistant",
                content: output,
                timestamp: new Date(),
                tps,
                numTokens,
                ttft,
                state
              });
            }
            return cloned;
          });
          break;
        }
        case "complete": {
          const { e2e, tpot, numTokens: finalNumTokens, tps: finalTps } = e.data;
          setIsTyping(false);
          setMessages((prev) => {
            const cloned = [...prev];
            const last = cloned.at(-1);
            if (last && last.role === "assistant") {
              cloned[cloned.length - 1] = {
                ...last,
                e2e,
                tpot,
                ...(finalNumTokens !== undefined && { numTokens: finalNumTokens }),
                ...(finalTps !== undefined && { tps: finalTps }),
              };
            }
            return cloned;
          });
          break;
        }
        default:
          break;
      }
    };

    currentWorker.addEventListener("message", onMessage);
    return () => {
      // Use the captured reference in cleanup
      currentWorker.removeEventListener("message", onMessage);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerRef.current]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isTyping) return;

    const hasImages = attachedImages.length > 0;

    // Build content: multimodal array if images attached, plain string otherwise
    const content: string | MessageContentPart[] = hasImages
      ? [
          ...attachedImages.map((img) => ({ type: "image" as const, image: img })),
          { type: "text" as const, text: input.trim() },
        ]
      : input.trim();

    const userMessage: Message = {
      id: uuidv4(),
      role: "user",
      content,
      timestamp: new Date(),
    };

    const nextMessages = [...messages, userMessage];

    setMessages((prev) => [...prev, userMessage]);

    workerRef.current?.postMessage({
      type: "generate",
      data: {
        messages: nextMessages,
        reasonEnabled,
        systemPromptEnabled,
        systemPromptText,
        images: hasImages ? attachedImages : undefined,
      },
    });
    setIsTyping(true);
    setInput("");
    setAttachedImages([]);
  };

  const backendName = BACKENDS.find(b => b.id === selectedBackend)?.name || selectedBackend;
  const selectedModelName = selectedModelObj ? `${selectedModelObj.name} ${selectedModelObj.parameter}` : selectedModel;

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
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2 overflow-hidden">
            <span className="font-semibold text-xs sm:text-sm md:text-base truncate text-gray-800">{selectedModelName}</span>
            <div className="flex items-center gap-1.5">
              <span className="text-gray-300 hidden sm:inline">·</span>
              <span className="text-[10px] sm:text-xs md:text-sm text-gray-400 truncate">{backendName}</span>
            </div>
          </div>
        </div>
        <div className="w-9 md:w-10 flex-shrink-0" />
      </div>

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto p-3 md:p-6 space-y-3 md:space-y-4 bg-gradient-to-b from-gray-50 to-white">
        <AnimatePresence>
          {messages.length === 0 ? (
            <motion.div
              key="empty-state"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="flex flex-col items-center justify-center h-full text-center text-gray-400"
            >
              <div className="rounded-2xl h-16 w-16 bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center mb-5 shadow-lg shadow-blue-500/20">
                <Sparkles className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-xl md:text-2xl font-semibold mb-2 text-gray-700">
                How can I help you today?
              </h3>
              <p className="max-w-md text-xs md:text-sm px-2 text-gray-400 mb-6">
                {anyModelReady ? "Ask me anything or try one of these examples:" : "Load a model from the sidebar to get started"}
              </p>
              <div className="grid grid-cols-1 gap-2.5 w-full max-w-md px-3">
                {["What are your model name and parameter count?", "A triangle has three sides with lengths in the ratio 2:3:4. Find the length of each side If the perimeter is 36cm.", "Explain the concept of 'inflation' in economics in just two sentences, using a simple analogy involving a pizza."].map((example, i) => (
                  <motion.div
                    key={example}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 + i * 0.08, duration: 0.35 }}
                  >
                    <Button
                      variant="outline"
                      className="justify-start text-left w-full py-3.5 md:py-4 px-4 text-xs md:text-sm whitespace-normal font-normal bg-white border-gray-200 hover:bg-blue-50/50 hover:border-blue-300 hover:cursor-pointer transition-all rounded-md shadow-sm hover:shadow min-h-[52px] md:min-h-[60px]"
                      onClick={() => setInput(example)}
                      disabled={!anyModelReady}
                    >
                      {example}
                    </Button>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ) : (
            messages.map((message) => <MessageBubble key={message.id} message={message} />)
          )}

          {isTyping && (
            <motion.div
              key="typing-indicator"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="flex items-center gap-2 px-4 py-3 rounded-md bg-white shadow-sm border border-gray-100 w-fit"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
              <span className="text-sm text-gray-500">
                {(() => {
                  const lastAssistant = messages.slice().reverse().find(m => m.role === "assistant");
                  if (lastAssistant?.state === "thinking") {
                    return reasonEnabled ? "Reasoning..." : "Thinking...";
                  }
                  if (lastAssistant?.state === "answering") {
                    return "Generating response...";
                  }
                  return reasonEnabled ? "Reasoning..." : "Thinking...";
                })()}
              </span>
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </AnimatePresence>
      </div>

      {/* Input area */}
      <div className="px-3 pb-3 pt-1 md:px-4 md:pb-4 md:pb-4 md:pt-1 border-t border-gray-200/60 bg-white">
        {/* Attachment bar — shown only for models with vision/video capabilities */}
        <AttachmentBar
          capabilities={modelCapabilities}
          attachedImages={attachedImages}
          onImagesAdded={(urls) => setAttachedImages((prev) => [...prev, ...urls])}
          onImageRemoved={(index) => setAttachedImages((prev) => prev.filter((_, i) => i !== index))}
          disabled={!anyModelReady}
        />
        <form onSubmit={handleSubmit} className="relative mt-1">
          <Textarea
            id="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={anyModelReady ? "Type your message..." : "Load a model to start chatting..."}
            disabled={!anyModelReady}
            className="w-full border border-gray-200 px-4 py-3 pr-14 text-sm md:text-sm placeholder:text-gray-300 disabled:opacity-40 min-h-[80px] md:min-h-[80px] max-h-[calc(30dvh)] overflow-auto resize-none rounded-md bg-gray-50/50 focus:bg-white focus:border-blue-300 transition-all"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                workerRef.current?.postMessage({ type: "reset" });
                setMessages([]);
                setInput("");
                setAttachedImages([]);
                setIsTyping(false);
                return;
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                const btn = document.getElementById('chat-send-btn');
                if (btn) (btn as HTMLButtonElement).click();
              }
            }}
          />

          <div className="absolute right-2.5 bottom-2.5">
            <Button
              id="chat-send-btn"
              type="submit"
              disabled={!input.trim() || isTyping}
              className={`flex-shrink-0 w-8 h-8 md:w-9 md:h-9 rounded-md flex items-center justify-center transition-all hover:cursor-pointer ${
                input.trim() && !isTyping
                  ? "bg-gradient-to-br from-blue-500 to-indigo-500 text-white shadow-md shadow-blue-500/25 hover:shadow-lg hover:shadow-blue-500/30"
                  : "bg-gray-100 text-gray-300 border border-gray-200"
              }`}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </div>
        </form>
        <div className="mt-2.5 mb-1">
          <div className="text-[11px] md:text-xs flex flex-col sm:flex-row items-center justify-center text-gray-400 gap-1.5 sm:gap-0">
            <div className="flex items-center sm:mr-3">
              <kbd className="text-[10px] md:text-[11px] border border-gray-200 bg-gray-50 rounded-md px-1.5 py-0.5 font-mono text-gray-400">Enter</kbd>
              <span className="ml-1.5">send</span>
            </div>
            <span className="hidden sm:inline text-gray-200">·</span>
            <div className="flex items-center sm:ml-3">
              <kbd className="text-[10px] md:text-[11px] border border-gray-200 bg-gray-50 rounded-md px-1.5 py-0.5 font-mono text-gray-400">Ctrl</kbd>
              <span className="mx-0.5 text-gray-300">+</span>
              <kbd className="text-[10px] md:text-[11px] border border-gray-200 bg-gray-50 rounded-md px-1.5 py-0.5 font-mono text-gray-400">Enter</kbd>
              <span className="ml-1.5">clear</span>
            </div>
          </div>
          <div className="mt-1.5 text-[10px] md:text-[11px] text-center text-gray-300 hover:text-blue-500 transition-colors">
            <a href="https://www.npmjs.com/package/@huggingface/transformers?activeTab=versions" target="_blank" rel="noopener noreferrer">
              Transformers.js {packageJson.dependencies["@huggingface/transformers"].replace(/^\^/, "")}
            </a>
          </div>
        </div>
      </div>
    </>
  )
}

// MessageBubble component unchanged
interface MessageBubbleProps {
  message: Message
}

function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user"
  const [copied, setCopied] = React.useState(false)

  const handleCopy = async () => {
    try {
      const parts: string[] = []
      if (message.ttft) parts.push(`TTFT ${message.ttft.toFixed(2)}ms`)
      if (message.tps) parts.push(`TPS ${message.tps.toFixed(2)} tok/s`)
      if (message.numTokens && message.tps) parts.push(`${message.numTokens} tokens / ${(message.numTokens / message.tps).toFixed(2)}s`)
      if (message.tpot) parts.push(`TPOT ${message.tpot.toFixed(2)}ms`)
      if (message.e2e) parts.push(`E2E ${(message.e2e / 1000).toFixed(2)}s`)
      const text = parts.length > 0 ? parts.join('; ') : 'No performance data'
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`flex message-group ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div className={`flex items-start max-w-[90%] sm:max-w-[85%] md:max-w-[75%] gap-2 md:gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
        <div
          className={`flex-shrink-0 w-7 h-7 md:w-8 md:h-8 rounded-md flex items-center justify-center ${
            isUser 
              ? "bg-gradient-to-br from-gray-100 to-gray-200" 
              : "bg-gradient-to-br from-blue-500 to-indigo-500"
          }`}
        >
          {isUser 
            ? <User className="h-3.5 w-3.5 md:h-4 md:w-4 text-gray-500" /> 
            : <Bot className="h-3.5 w-3.5 md:h-4 md:w-4 text-white" />
          }
        </div>

        <div className="flex flex-col gap-1">
          <div
            className={`px-3.5 py-3 md:px-4 md:py-3.5 text-sm md:text-base ${isUser
              ? "bg-gradient-to-br from-blue-500 to-indigo-500 text-white rounded-bl-md"
              : "bg-white border border-gray-100 shadow-sm rounded-tr-md"
            }`}
          >
            {isUser ? (
              <div className="space-y-2">
                {/* Render image thumbnails for multimodal user messages */}
                {Array.isArray(message.content) && message.content.some(p => p.type === "image") && (
                  <div className="flex flex-wrap gap-1.5">
                    {message.content.filter(p => p.type === "image").map((p, i) => (
                      <img
                        key={i}
                        src={p.image}
                        alt={`Attached ${i + 1}`}
                        className="h-20 w-20 md:h-24 md:w-24 object-cover rounded-md border border-white/20"
                      />
                    ))}
                  </div>
                )}
                <div className="text-sm md:text-sm whitespace-pre-wrap break-words leading-relaxed">{getMessageText(message.content)}</div>
              </div>
            ) : (
              <div
                className="text-sm md:text-sm whitespace-pre-wrap break-words leading-relaxed text-gray-700"
                dangerouslySetInnerHTML={{ __html: getMessageText(message.content) }}
              />
            )}
          </div>

          <div className={`flex flex-wrap items-center gap-1.5 px-1 ${isUser ? "justify-end" : "justify-start"}`}>
            <span className="text-[10px] text-gray-300">
              {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
            {!isUser && (
              <>
                {message.ttft && (
                  <span className="bg-blue-50 text-blue-500 text-[10px] rounded-md px-1.5 py-0.5 font-medium tabular-nums" title={"Time to First Token (TTFT)\nMeasures the time from when a request is submitted to when the very first output token appears. A low TTFT (ideally under 500ms) is crucial for a responsive feel, as it minimizes the initial perceived delay.\nCalculation: Time at arrival of first output token − Time at request submission."}>
                    TTFT: {message.ttft.toFixed(2)}ms
                  </span>
                )}
                {message.tps && (
                  <span className="bg-emerald-50 text-emerald-600 text-[10px] rounded-md px-1.5 py-0.5 font-medium tabular-nums" title={"Tokens Per Second (TPS)\nThe rate at which output tokens are produced during the decode phase (excluding the time to first token). A higher value means faster, smoother streaming.\nCalculation: (Total output tokens − 1) / (Total generation time − TTFT)."}>
                    TPS: {message.tps.toFixed(2)}
                  </span>
                )}
                {message.numTokens && message.tps && (
                  <span className="bg-indigo-50 text-indigo-500 text-[10px] rounded-md px-1.5 py-0.5 font-medium tabular-nums" title={"Throughput\nMeasures the overall system capacity in tokens per second. Higher throughput means the model generates text faster and can handle more requests efficiently.\nCalculation: Total number of output tokens generated / Total generation time."}>
                    Throughput: {message.numTokens} tokens / {(message.numTokens / message.tps).toFixed(2)}s
                  </span>
                )}
                {message.tpot && (
                  <span className="bg-violet-100 text-violet-700 text-[10px] rounded-md px-1.5 py-0.5 font-medium tabular-nums" title={"Time Per Output Token (TPOT) aka. Inter-Token Latency (ITL)\nMeasures the average time it takes to generate each subsequent token after the first one. This determines the smoothness and speed of the streaming response.\nCalculation: (Total Latency − TTFT) / (Total Output Tokens − 1)."}>
                    TPOT: {message.tpot.toFixed(2)}ms
                  </span>
                )}
                {message.e2e && (
                  <span className="bg-amber-100 text-amber-700 text-[10px] rounded-md px-1.5 py-0.5 font-medium tabular-nums" title={"End-to-End Latency (E2E) aka. Total Latency\nThe total time from sending the request to receiving the final token of the complete response. This is the wall-clock time the user waits for the full answer.\nCalculation: Time at completion of request − Time at request submission."}>
                    E2E: {message.e2e >= 1000 ? `${(message.e2e / 1000).toFixed(2)}s` : `${message.e2e.toFixed(2)}ms`}
                  </span>
                )}
                <button
                  onClick={handleCopy}
                  className="copy-btn p-1 rounded-md hover:bg-gray-100 transition-colors"
                  title="Copy performance data to clipboard"
                  aria-label="Copy performance data to clipboard"
                >
                  {copied 
                    ? <Check className="h-3 w-3 text-green-500" /> 
                    : <Copy className="h-3 w-3 text-gray-300 hover:text-gray-500" />
                  }
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

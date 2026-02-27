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
import type { ModelType, BackendType, Message } from "../lib/types"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ArrowUp, Menu, X, User, Bot, Sparkles, Loader2 } from "lucide-react"
import { MODELS, BACKENDS } from "../lib/constants"
import { v4 as uuidv4 } from "uuid"
import packageJson from "../package.json"

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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const anyModelReady = Object.values(modelLoadState).includes("ready");

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
          setIsTyping(false);
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

    const userMessage: Message = {
      id: uuidv4(),
      role: "user",
      content: input.trim(),
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
        systemPromptText
      },
    });
    setIsTyping(true);
    setInput("");
  };

  const backendName = BACKENDS.find(b => b.id === selectedBackend)?.name || selectedBackend;
  const selectedModelObj = MODELS.find((m) => m.id === selectedModel);
  const selectedModelName = selectedModelObj ? `${selectedModelObj.name} ${selectedModelObj.parameter}` : selectedModel;

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between p-3 md:p-4 border-b border-gray-200 bg-white shadow-sm">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="h-9 w-9 md:h-10 md:w-10 flex-shrink-0"
        >
          {isSidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
        <div className="flex items-center space-x-2 overflow-hidden px-2">
          <Sparkles className="h-4 w-4 md:h-5 md:w-5 text-blue-500 flex-shrink-0" />
          <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-2 overflow-hidden">
            <span className="font-medium text-xs sm:text-sm md:text-base truncate">{selectedModelName}</span>
            <div className="flex items-center space-x-2">
              <span className="text-gray-400 hidden sm:inline">•</span>
              <span className="text-[10px] sm:text-xs md:text-sm text-gray-500 truncate">{backendName}</span>
            </div>
          </div>
        </div>
        <div className="w-9 md:w-10 flex-shrink-0" /> {/* Empty div for flex spacing */}
      </div>

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto p-2 md:p-4 space-y-2 md:space-y-4 bg-gray-50">
        <AnimatePresence>
          {messages.length === 0 ? (
            <motion.div
              key="empty-state"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full text-center text-gray-500"
            >
              <Sparkles className={`h-12 w-12 mb-4 ${anyModelReady ? 'text-blue-500' : ''} opacity-80`} />
              <h3 className={`text-xl font-medium mb-2 ${anyModelReady ? 'text-blue-500' : ''}`}>
                How can I help you today?
              </h3>
              <p className="max-w-md text-xs md:text-sm px-2">Ask me anything or try one of these examples:</p>
              <div className="grid grid-cols-1 gap-3 mt-4 md:mt-5 w-full max-w-md px-3">
                {["What are your model name and parameter count?", "A triangle has three sides with lengths in the ratio 2:3:4. Find the length of each side If the perimeter is 36cm.", "Explain the concept of 'inflation' in economics in just two sentences, using a simple analogy involving a pizza."].map((example) => (
                  <Button
                    key={example}
                    variant="outline"
                    className="justify-start text-left py-4 md:py-5 px-4 text-xs md:text-sm whitespace-normal font-normal bg-white border-gray-300 hover:bg-gray-50 hover:border-blue-400 hover:cursor-pointer transition-all min-h-[60px] md:min-h-[70px]"
                    onClick={() => setInput(example)}
                    disabled={!anyModelReady}
                  >
                    {example}
                  </Button>
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
              className="flex items-center space-x-2 p-4 rounded-lg bg-white shadow-sm w-fit"
            >
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              <span className="text-sm text-gray-600">
                {(() => {
                  const lastAssistant = messages.slice().reverse().find(m => m.role === "assistant");
                  if (lastAssistant?.state === "thinking") {
                    return reasonEnabled ? "thinking (reasoning enabled) ..." : "thinking ...";
                  }
                  if (lastAssistant?.state === "answering") {
                    return reasonEnabled ? "answering (reasoning enabled) ..." : "answering ...";
                  }
                  // fallback
                  return reasonEnabled ? "thinking (reasoning enabled) ..." : "thinking ...";
                })()}
              </span>
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </AnimatePresence>
      </div>

      {/* Input area */}
      <div className="p-3 md:p-4 border-t border-gray-200 bg-white">
        <form onSubmit={handleSubmit} className="relative">
          <Textarea
            id="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            disabled={!anyModelReady}
            className="w-full border px-3 py-3 pr-12 text-sm md:text-base placeholder:text-muted-foreground disabled:opacity-50 min-h-[56px] md:min-h-[64px] max-h-[calc(30dvh)] overflow-auto resize-none rounded-lg bg-gray-50 focus:bg-white dark:border-zinc-700 transition-colors"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                // Send reset message to worker
                workerRef.current?.postMessage({ type: "reset" });
                setMessages([]);
                setInput("");
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

          <div className="absolute right-2 bottom-2">
            <Button
              id="chat-send-btn"
              type="submit"
              disabled={!input.trim() || isTyping}
              className="flex-shrink-0 w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center border hover:border-blue-600 hover:cursor-pointer hover:text-blue-600 transition-colors"
            >
              <ArrowUp className="h-4 w-4 md:h-5 md:w-5" />
            </Button>
          </div>
        </form>
        <div className="my-3">
          <div className="text-[11px] md:text-xs flex flex-col sm:flex-row items-center justify-center text-gray-500 gap-2 sm:gap-0">
            <div className="flex items-center sm:mr-3">
              <kbd className="text-[10px] md:text-[11px] border border-gray-300 bg-gray-50 rounded px-1.5 py-0.5 font-mono">Enter</kbd>
              <span className="ml-1.5">to send</span>
            </div>
            <span className="hidden sm:inline text-gray-300">•</span>
            <div className="flex items-center sm:ml-3">
              <kbd className="text-[10px] md:text-[11px] border border-gray-300 bg-gray-50 rounded px-1.5 py-0.5 font-mono">Ctrl</kbd>
              <span className="mx-1">+</span>
              <kbd className="text-[10px] md:text-[11px] border border-gray-300 bg-gray-50 rounded px-1.5 py-0.5 font-mono">Enter</kbd>
              <span className="ml-1.5">to clear chat</span>
            </div>
          </div>
          <div className="mt-1 text-[11px] md:text-xs text-center font-medium text-blue-500 hover:text-blue-600 hover:underline transition-colors">
            <a href="https://www.npmjs.com/package/@huggingface/transformers?activeTab=versions" target="_blank" rel="noopener noreferrer">Transformers.js {packageJson.dependencies["@huggingface/transformers"].replace(/^\^/, "")}</a>
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div className={`flex items-start max-w-[90%] sm:max-w-[85%] md:max-w-[80%] space-x-2 md:space-x-3 ${isUser ? "flex-row-reverse space-x-reverse" : ""}`}>
        <div
          className={`flex-shrink-0 w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center border border-solid border-gray-200 justify-center hover:border-blue-500 hover:cursor-pointer transition-colors`}
        >
          {isUser ? <User className="h-3.5 w-3.5 md:h-4 md:w-4 text-gray-500 hover:text-blue-600" /> : <Bot className="h-3.5 w-3.5 md:h-4 md:w-4 text-gray-500 hover:text-blue-600" />}
        </div>

        <div
          className={`p-3 md:p-4 text-sm md:text-base rounded-lg ${isUser
            ? "hover:bg-gradient-to-br hover:from-gray-50 hover:to-gray-100 border border-blue-200 hover:cursor-pointer shadow-sm"
            : "bg-white border border-gray-200 shadow-sm"
            }`}
        >
          {isUser ? (
            <div className="text-sm md:text-base whitespace-pre-wrap break-words">{message.content}</div>
          ) : (
            <div
              className="text-sm md:text-base whitespace-pre-wrap break-words"
              dangerouslySetInnerHTML={{ __html: message.content }}
            />
          )
          }
          <div className={`text-[10px] md:text-xs flex flex-wrap items-center gap-2 mt-3 ${isUser ? "opacity-70" : "text-gray-500"}`}>
            <div className="font-medium">{new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
            {!isUser && (
              <>
                {message.ttft && (
                  <span className="bg-gradient-to-br from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-[10px] md:text-xs text-white rounded px-2 py-0.5" title="Time to first token">
                    TTFT: {message.ttft.toFixed(2)}ms
                  </span>
                )}
                {message.numTokens && message.tps && (
                  <span className="bg-gradient-to-br from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-[10px] md:text-xs text-white rounded px-2 py-0.5" title="Generation time">
                    {message.numTokens} tokens / {(message.numTokens / message.tps).toFixed(2)}s
                  </span>
                )}
                {message.tps && (
                  <span className="bg-gradient-to-br from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-[10px] md:text-xs text-white rounded px-2 py-0.5" title="Tokens per second">
                    {message.tps.toFixed(2)} tokens/s
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

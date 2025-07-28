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

import type { ProgressProps } from "@/components/progress"

interface ChatInterfaceProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  selectedModel: ModelType;
  selectedBackend: BackendType;
  setProgressItems?: React.Dispatch<React.SetStateAction<ProgressProps[]>>;
  workerRef: React.RefObject<Worker | null>; // Add worker ref prop
}

export function ChatInterface({ isSidebarOpen, setIsSidebarOpen, selectedModel, selectedBackend, setProgressItems, workerRef }: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ❌ REMOVED: setConfig is now handled globally in page.tsx
  // useEffect(() => {
  //   if (!workerRef.current) return;
  //   const selectedModelObj = MODELS.find((m) => m.id === selectedModel);
  //   if (!selectedModelObj) return;
  //   workerRef.current.postMessage({
  //     type: "setConfig",
  //     model_id: selectedModel,
  //     data_type: selectedModelObj.dataType,
  //     device: selectedBackend,
  //   });
  // }, [selectedModel, selectedBackend, workerRef]);

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
          const { output, tps, numTokens } = e.data;
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
              };
            } else {
              cloned.push({
                id: uuidv4(),
                role: "assistant",
                content: output,
                timestamp: new Date(),
                tps,
                numTokens,
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

    // Use passed workerRef instead of local one
    workerRef.current?.postMessage({
      type: "generate",
      data: nextMessages, // ✅ Send array, not string!
    });
    setIsTyping(true);
    setInput("");
  };

  const backendName = BACKENDS.find(b => b.id === selectedBackend)?.name || selectedBackend;
  const selectedModelObj = MODELS.find((m) => m.id === selectedModel);
  const selectedModelName = selectedModelObj ? selectedModelObj.name : selectedModel;

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
        <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
          {isSidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
        <div className="flex items-center space-x-2">
          <Sparkles className="h-4 w-4 text-blue-500" />
          <span className="font-medium">{selectedModelName}</span>
          <span className="text-gray-400">•</span>
          <span className="text-sm text-gray-500">{backendName}</span>
        </div>
        <div className="w-9" /> {/* Empty div for flex spacing */}
      </div>

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        <AnimatePresence>
          {messages.length === 0 ? (
            <motion.div
              key="empty-state"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full text-center text-gray-500"
            >
              <Sparkles className="h-12 w-12 mb-4 text-blue-500 opacity-80" />
              <h3 className="text-xl font-medium mb-2">How can I help you today?</h3>
              <p className="max-w-md text-sm">Ask me anything or try one of these examples:</p>
              <div className="grid grid-cols-1 gap-2 mt-4 w-full max-w-md">
                {["Explain transformer model", "Write a poem about AI", "What is WebNN API"].map((example) => (
                  <Button
                    key={example}
                    variant="outline"
                    className="justify-start text-left py-5 bg-white border-gray-200 hover:bg-gray-100 hover:cursor-pointer"
                    onClick={() => {
                      setInput(example)
                    }}
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
              <span className="text-sm text-gray-600">thinking ...</span>
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </AnimatePresence>
      </div>

      {/* Input area */}
      <div className="pt-2 px-2 border-t border-gray-200 bg-white">
        <form onSubmit={handleSubmit} className="min-h-[80px] max-h-[calc(30dvh)] mb-[-34px]">
          <Textarea
            id="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            className="flex self-start border px-2 py-2 text-md placeholder:text-muted-foreground disabled:opacity-50 md:text-sm min-h-[80px] max-h-[calc(30dvh)] overflow-hidden resize-none rounded-md bg-muted dark:border-zinc-700"
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

          <div className="relative right-[13px] bottom-[46px] flex justify-end">
            <Button
              id="chat-send-btn"
              type="submit"
              disabled={!input.trim() || isTyping}
              className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 hover:cursor-pointer text-white"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </div>
        </form>
        <div className="text-[11px] flex justify-center my-3 text-gray-500">
          <div className="mr-2"><span className="text-[10px] border border-gray-200 border-solid rounded-sm px-1 pb-1">enter</span> continue the conversation</div>
          ·
          <div className="ml-2">
            <span className="text-[10px] border border-gray-200 border-solid rounded-sm px-1 pb-1 self-center">ctrl</span>
            <span className="ml-1 text-[10px] border border-gray-200 border-solid rounded-sm px-1 pb-1 self-center">enter</span> clears the chat history and start a new conversation</div>
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
      <div className={`flex items-start max-w-[80%] space-x-2 ${isUser ? "flex-row-reverse space-x-reverse" : ""}`}>
        <div
          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 hover:cursor-pointer`}
        >
          {isUser ? <User className="h-4 w-4 text-white" /> : <Bot className="h-4 w-4 text-white" />}
        </div>

        <div
          className={`p-3 rounded-lg ${isUser
            ? "bg-gradient-to-br from-gray-50 to-gray-100 border border-blue-200 hover:cursor-pointer shadow-sm"
            : "bg-white border border-gray-200 shadow-sm"
            }`}
        >
          <div className="text-xs whitespace-pre-wrap">{message.content}</div>
          <div className={`text-xs grid grid-cols-6 gap-4 mt-2 ${isUser ? "opacity-70" : "text-gray-500"}`}>
            <div>{new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
            <div className="col-span-5 justify-self-end">
              {isUser ? "" : (
                <span className="self-center bg-gradient-to-br from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-xs text-white rounded-sm px-1">
                  {message.numTokens && message.tps
                    ? `Generated ${message.numTokens} tokens in ${(message.numTokens / message.tps).toFixed(2)} seconds`
                    : ""}
                </span>
              )}
              {isUser ? "" : (
                <span className="self-center ml-2 bg-gradient-to-br from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-xs text-white rounded-sm px-1">
                  {message.tps ? `${message.tps.toFixed(2)} tokens/sec` : ""}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
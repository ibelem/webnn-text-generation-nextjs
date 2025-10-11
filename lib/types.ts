export type ModelType = "phi-3_5-mini" | "phi-4-mini" | "qwen3-0_6b" | "deepseek-r1-distill-qweb-1_5b" | "lfm2_350m" | "smollm3-3b" | "llama_3-2_1b" | "gemma_3_1b_it_gqa";
export type BackendType = "webgpu" | "webnn-gpu" | "webnn-npu"

export interface Message {
  id: string
  role: "user" | "assistant" | "system" // tool
  content: string
  timestamp: Date,
  tps?: number;
  numTokens?: number;
  ttft?: number; // time to first token in ms
  state?: string
}

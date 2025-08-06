export type ModelType = "phi-3_5-mini" | "phi-4-mini" | "qwen3-0_6b" | "deepseek-r1-distill-qweb-1_5b" | "lfm2_350m";
export type BackendType = "webgpu" | "webnn-gpu" | "webnn-npu"

export interface Message {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  timestamp: Date,
  tps?: number;
  numTokens?: number;
  state?: string
}

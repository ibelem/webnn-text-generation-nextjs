export type ModelType = "phi-3_5-mini" | "phi-4-mini"
export type BackendType = "webgpu" | "webnn-gpu" | "webnn-npu"

export interface Message {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  timestamp: Date,
  tps?: number;
  numTokens?: number;
}

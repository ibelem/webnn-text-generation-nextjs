export type ModelType = "gemma_3_1b_it_gqa" | "phi-3_5-mini" | "phi-4-mini-instruct" | "llama_3-2_1b" | "qwen3-4b" | "qwen3-0_6b" | "deepseek-r1-distill-qweb-1_5b" | "lfm2_1_2b" | "smollm3-3b" | "gpt-oss-20b" | "qwen3_5-0_8b" | "gemma4-e2b";
export type BackendType = "webgpu" | "webnn-gpu" | "webnn-npu"

/** What input modalities a model supports */
export type ModelCapability = "text" | "vision" | "video" | "audio";

/** Which transformers.js model class to use for loading */
export type ModelClass = "causal-lm" | "conditional-generation";

/** A single part of a multimodal message */
export interface MessageContentPart {
  type: "text" | "image" | "audio";
  text?: string;
  /** Data URL or object URL for image content */
  image?: string;
  /** Human-readable label for an attached audio clip, e.g. "recording.wav (5.3s)" */
  audioLabel?: string;
}

export interface Message {
  id: string
  role: "user" | "assistant" | "system" // tool
  content: string | MessageContentPart[]
  timestamp: Date,
  tps?: number;
  numTokens?: number;
  ttft?: number; // time to first token in ms
  e2e?: number; // end-to-end latency in ms
  decodeTime?: number; // decode-only time in ms (e2e - ttft)
  tpot?: number; // time per output token (inter-token latency) in ms
  state?: string
}

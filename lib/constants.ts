import type { ModelType, BackendType } from "../lib/types"

export const MODELS: Array<{
  id: ModelType;
  model: string;
  dataType: string;
  name: string;
  desc: string;
  parameter: string;
  size: string;
  useExternalDataFormat?: boolean;
  maxNewTokens?: number;
  doSample?: boolean;
  topK?: number;
  temperature?: number;
  systemPrompt?: string;
  thinkingTagSupport?: boolean;
}> = [
  {
    id: "phi-3_5-mini" as ModelType,
    model: "onnx-community/Phi-3.5-mini-instruct-onnx-web",
    dataType: "q4f16",
    name: "Phi-3.5 Mini",
    desc: "SLM",
    parameter: "3.8B",
    size: "2.15GB",
    useExternalDataFormat: true,
    maxNewTokens: 1024,
    doSample: true,
    topK: 3,
    temperature: 0.2,
    systemPrompt: "",
    thinkingTagSupport: false,
  },
  {
    id: "smollm3-3b" as ModelType,
    model: "HuggingFaceTB/SmolLM3-3B-ONNX",
    dataType: "q4f16",
    name: "SmolLM3",
    desc: "LLM",
    parameter: "3.0B",
    size: "1.97GB",
    useExternalDataFormat: true,
    maxNewTokens: 1024,
    doSample: false,
    topK: 20,
    temperature: 0.7,
    systemPrompt: "You are SmolLM, a language model created by Hugging Face.",
    thinkingTagSupport: false,
  },
  {
    id: "qwen3-0_6b" as ModelType,
    model: "onnx-community/Qwen3-0.6B-ONNX",
    dataType: "q4f16",
    name: "Qwen3",
    desc: "LLM",
    parameter: "0.6B",
    size: "543MB",
    useExternalDataFormat: false,
    maxNewTokens: 512,
    doSample: false,
    topK: 20,
    temperature: 0.7,
    systemPrompt: "",
    thinkingTagSupport: true,
  },
  {
    id: "deepseek-r1-distill-qweb-1_5b" as ModelType,
    model: "onnx-community/DeepSeek-R1-Distill-Qwen-1.5B-ONNX",
    dataType: "q4f16",
    name: "DeepSeek R1 Distill",
    desc: "LLM",
    parameter: "1.5B",
    size: "1.27GB",
    useExternalDataFormat: false,
    maxNewTokens: 512,
    doSample: false,
    topK: 20,
    temperature: 0.7,
    systemPrompt: "You are DeepSeek R1 Distill Qwen.",
    thinkingTagSupport: false,
  },
];

export const BACKENDS: Array<{
  id: BackendType;
  name: string;
}> = [
  { id: "webgpu" as BackendType, name: "WebGPU" },
  { id: "webnn-gpu" as BackendType, name: "WebNN GPU" },
  { id: "webnn-npu" as BackendType, name: "WebNN NPU" },
];

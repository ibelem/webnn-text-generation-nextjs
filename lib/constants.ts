import type { ModelType, BackendType, ModelCapability, ModelClass } from "../lib/types"

export const MODELS: Array<{
  id: ModelType;
  model: string;
  dataType: string | Record<string, string>;
  name: string;
  producer: string;
  desc: string;
  parameter: string;
  size: string;
  useExternalDataFormat?: boolean | number | Record<string, number>; // true/1 = single external data chunk for all files, number = chunk count, object = per-file chunk counts
  maxNewTokens?: number;
  doSample?: boolean;
  topK?: number;
  temperature?: number;
  systemPrompt?: string;
  thinkingTagSupport?: boolean;
  useKVCache?: boolean;
  usePipeline?: boolean;
  /** What input modalities the model supports (default: ["text"]) */
  capabilities?: ModelCapability[];
  /** Which transformers.js model class to use (default: "causal-lm") */
  modelClass?: ModelClass;
}> = [
    {
      id: "phi-4-mini-instruct" as ModelType,
      model: "onnx-community/Phi-4-mini-instruct-ONNX",
      dataType: "q4f16",
      name: "Phi-4 Mini",
      producer: "MS",
      desc: "SLM",
      parameter: "3.8B",
      size: "2.34GB",
      useExternalDataFormat: 2,
      maxNewTokens: 1024,
      doSample: true,
      topK: 3,
      temperature: 0.2,
      systemPrompt: "",
      thinkingTagSupport: false,
    },
    {
      id: "qwen3-4b" as ModelType,
      model: "webgpu/Qwen3-4B-ONNX",
      dataType: "q4f16",
      name: "Qwen3",
      producer: "Ali",
      desc: "LLM",
      parameter: "4.0B",
      size: "2.63GB",
      useExternalDataFormat: true,
      maxNewTokens: 1024,
      doSample: true,
      topK: 20,
      temperature: 0.6,
      systemPrompt: "",
      thinkingTagSupport: false,
      useKVCache: true,
    },
  ];

export const BACKENDS: Array<{
  id: BackendType;
  name: string;
}> = [
    { id: "webgpu" as BackendType, name: "WebGPU" },
  ];

export const DEFAULT_SYSTEM_PROMPT = ``;

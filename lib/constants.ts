import type { ModelType, BackendType } from "../lib/types"

export const MODELS: Array<{
  id: ModelType;
  model: string;
  dataType: string;
  name: string;
  producer: string;
  desc: string;
  parameter: string;
  size: string;
  useExternalDataFormat?: boolean | number; // true means use external data format for all backends, number means use external data format for backends with index >= that number in BACKENDS
  maxNewTokens?: number;
  doSample?: boolean;
  topK?: number;
  temperature?: number;
  systemPrompt?: string;
  thinkingTagSupport?: boolean;
  useKVCache?: boolean;
  usePipeline?: boolean;
}> = [
    {
      // https://github.com/huggingface/transformers.js/issues/1239
      // Works on WebGPU EP in Node.js binding
      // Crashes when using JSEP
      // https://github.com/huggingface/transformers.js/issues/1469
      // should fix the issue for fp16 and q4f16 variants
      id: "gemma_3_1b_it_gqa" as ModelType,
      model: "onnx-community/gemma-3-1b-it-ONNX-GQA",
      dataType: "q4f16",
      name: "Gemma 3",
      producer: "Google",
      desc: "SLM",
      parameter: "1B",
      size: "983MB",
      useExternalDataFormat: true,
      maxNewTokens: 1024,
      doSample: true,
      topK: 64,
      temperature: undefined,
      systemPrompt: "",
      thinkingTagSupport: false,
    },
    {
      id: "phi-3_5-mini" as ModelType,
      model: "onnx-community/Phi-3.5-mini-instruct-onnx-web",
      dataType: "q4f16",
      name: "Phi-3.5 Mini",
      producer: "MS",
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
      id: "llama_3-2_1b" as ModelType,
      model: "onnx-community/Llama-3.2-1B-Instruct-ONNX",
      dataType: "q4f16",
      name: "Llama 3.2",
      producer: "Meta",
      desc: "LLM",
      parameter: "1B",
      size: "1.01GB",
      useExternalDataFormat: true,
      maxNewTokens: 1024,
      doSample: true,
      topK: 3,
      temperature: 0.6,
      systemPrompt: "",
      thinkingTagSupport: false,
      useKVCache: true,
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
    {
      id: "qwen3-0_6b" as ModelType,
      model: "onnx-community/Qwen3-0.6B-ONNX",
      dataType: "q4f16",
      name: "Qwen3",
      producer: "Ali",
      desc: "LLM",
      parameter: "0.6B",
      size: "543MB",
      useExternalDataFormat: false,
      maxNewTokens: 1024,
      doSample: false,
      topK: 20,
      temperature: 0.7,
      systemPrompt: "",
      thinkingTagSupport: true,
      useKVCache: true,
    },
    {
      id: "deepseek-r1-distill-qweb-1_5b" as ModelType,
      model: "onnx-community/DeepSeek-R1-Distill-Qwen-1.5B-ONNX",
      dataType: "q4f16",
      name: "DeepSeek R1 Distill",
      producer: "DS",
      desc: "LLM",
      parameter: "1.5B",
      size: "1.27GB",
      useExternalDataFormat: false,
      maxNewTokens: 2048,
      doSample: false,
      topK: 3,
      temperature: 0.2,
      systemPrompt: "",
      thinkingTagSupport: true,
    },
    {
      id: "gpt-oss-20b" as ModelType,
      model: "onnx-community/gpt-oss-20b-ONNX",
      dataType: "q4f16",
      name: "GPT-OSS",
      producer: "OpenAI",
      desc: "MoE LLM",
      parameter: "20B",
      size: "11.8GB",
      useExternalDataFormat: 7,
      maxNewTokens: 2048,
      doSample: true,
      topK: 50,
      temperature: 1.0,
      systemPrompt: "You are a helpful assistant.",
      thinkingTagSupport: true,
      usePipeline: true,
    },
    {
      id: "lfm2_1_2b" as ModelType,
      model: "onnx-community/LFM2-1.2B-ONNX",
      dataType: "q4",
      name: "LFM2",
      producer: "Liquid AI",
      desc: "Compact LLM",
      parameter: "1.2B",
      size: "1.13GB",
      useExternalDataFormat: true,
      maxNewTokens: 1024,
      doSample: false,
      topK: 20,
      temperature: 0.3,
      systemPrompt: "",
      thinkingTagSupport: false,
    },
    {
      id: "lfm2_5_1_2b" as ModelType,
      model: "LFM2.5-1.2B-Thinking-ONNX",
      dataType: "q4",
      name: "LFM2.5",
      producer: "Liquid AI",
      desc: "Compact LLM",
      parameter: "1.2B",
      size: "850MB",
      useExternalDataFormat: true,
      // https://huggingface.co/spaces/LiquidAI/LFM2.5-1.2B-Thinking-WebGPU/blob/main/src/hooks/LLMProvider.tsx#L125
      maxNewTokens: 65536,
      doSample: false,
      topK: 20,
      temperature: 0.3,
      systemPrompt: "",
      thinkingTagSupport: true,
    },
    {
      id: "smollm3-3b" as ModelType,
      model: "HuggingFaceTB/SmolLM3-3B-ONNX",
      dataType: "q4f16",
      name: "SmolLM3",
      producer: "Hugging Face",
      desc: "LLM",
      parameter: "3.0B",
      size: "1.97GB",
      useExternalDataFormat: true,
      maxNewTokens: 1024,
      doSample: false,
      topK: 20,
      temperature: 0.7,
      systemPrompt: "",
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

export const DEFAULT_SYSTEM_PROMPT = ``;

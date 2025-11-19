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
    producer: "Microsoft",
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
    id: "phi-4-mini-gqa" as ModelType,
    model: "onnx-community/Phi-4-mini-instruct-ONNX-GQA",
    dataType: "q4f16",
    name: "Phi-4 Mini GQA",
    producer: "Microsoft",
    desc: "SLM",
    parameter: "3.8B",
    size: "2.85GB",
    useExternalDataFormat: true,
    maxNewTokens: 1024,
    doSample: true,
    topK: 3,
    temperature: 0.2,
    systemPrompt: "",
    thinkingTagSupport: false,
  },
  {
    id: "phi-4-mini-mha" as ModelType,
    model: "onnx-community/Phi-4-mini-instruct-ONNX-MHA",
    dataType: "q4f16",
    name: "Phi-4 Mini MHA",
    producer: "Microsoft",
    desc: "SLM",
    parameter: "3.8B",
    size: "2.85GB",
    useExternalDataFormat: true,
    maxNewTokens: 1024,
    doSample: true,
    topK: 3,
    temperature: 0.2,
    systemPrompt: "",
    thinkingTagSupport: false,
  },
  // {
  //   // https://github.com/huggingface/transformers.js/issues/1239
  //   // Works on WebGPU EP in Node.js binding
  //   // Crashes when using JSEP
  //   id: "gemma_3_1b_it_gqa" as ModelType,
  //   model: "onnx-community/gemma-3-1b-it-ONNX-GQA",
  //   dataType: "q4",
  //   name: "Gemma 3",
  //   producer: "Google",
  //   desc: "LLM",
  //   parameter: "1B",
  //   size: "982MB",
  //   useExternalDataFormat: false,
  //   maxNewTokens: 512,
  //   doSample: false,
  //   topK: undefined,
  //   temperature: undefined,
  //   systemPrompt: "You are a helpful assistant.",
  //   thinkingTagSupport: false,
  // },
  {
    id: "llama_3-2_1b" as ModelType,
    model: "onnx-community/Llama-3.2-1B-Instruct-q4f16",
    dataType: "q4f16",
    name: "Llama 3.2",
    producer: "Meta",
    desc: "LLM",
    parameter: "1B",
    size: "1.15GB",
    useExternalDataFormat: false,
    maxNewTokens: 1024,
    doSample: false,
    topK: 3,
    temperature: 0.2,
    systemPrompt: "You are a helpful assistant.",
    thinkingTagSupport: false,
  },
  {
    id: "qwen3-0_6b" as ModelType,
    model: "onnx-community/Qwen3-0.6B-ONNX",
    dataType: "q4f16",
    name: "Qwen3",
    producer: "Alibaba",
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
    systemPrompt: "You are DeepSeek R1 Distill Qwen.",
    thinkingTagSupport: true,
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
    systemPrompt: "You are SmolLM, a language model created by Hugging Face.",
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

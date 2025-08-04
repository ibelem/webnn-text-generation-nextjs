import type { ModelType, BackendType } from "../lib/types"

export const MODELS: Array<{
  id: ModelType;
  model: string;
  dataType: string;
  name: string;
  desc: string;
  parameter: string;
  size: string;
  useExternalDataFormat?: boolean; // <-- Add this line
}> = [
  {
    id: "phi-3_5-mini" as ModelType,
    model: "onnx-community/Phi-3.5-mini-instruct-onnx-web",
    dataType: "q4f16",
    name: "Phi-3.5 Mini",
    desc: "SLM",
    parameter: "3.8B",
    size: "2.15GB",
    useExternalDataFormat: true, // <-- Set for Phi
  },
  {
    id: "qwen3-0_6b" as ModelType,
    model: "onnx-community/Qwen3-0.6B-ONNX",
    dataType: "q4f16",
    name: "Qwen3",
    desc: "LLM",
    parameter: "0.6B",
    size: "543MB",
    useExternalDataFormat: false, // <-- Set for Qwen
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
  },
  // {
  //   id: "phi-4-mini" as ModelType,
  //   model: "webnn/Phi-4-mini-instruct-onnx-transformers_js",
  //   dataType: "q4f16",
  //   name: "Phi-4 Mini",
  //   desc: "Small language model",
  // },
];

export const BACKENDS: Array<{
  id: BackendType;
  name: string;
}> = [
  { id: "webgpu" as BackendType, name: "WebGPU" },
  { id: "webnn-gpu" as BackendType, name: "WebNN GPU" },
  { id: "webnn-npu" as BackendType, name: "WebNN NPU" },
];

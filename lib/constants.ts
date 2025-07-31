import type { ModelType, BackendType } from "../lib/types"

export const MODELS: Array<{
  id: ModelType;
  model: string;
  dataType: string;
  name: string;
  desc: string;
  useExternalDataFormat?: boolean; // <-- Add this line
}> = [
  {
    id: "phi-3_5-mini" as ModelType,
    model: "onnx-community/Phi-3.5-mini-instruct-onnx-web",
    dataType: "q4f16",
    name: "Phi-3.5 Mini",
    desc: "Small language model",
    useExternalDataFormat: true, // <-- Set for Phi
  },
  {
    id: "qwen3-0_6b" as ModelType,
    model: "onnx-community/Qwen3-0.6B-ONNX",
    dataType: "q4f16",
    name: "Qwen3 0.6B",
    desc: "Large language model",
    useExternalDataFormat: false, // <-- Set for Qwen
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

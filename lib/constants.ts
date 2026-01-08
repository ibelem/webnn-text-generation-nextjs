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
      desc: "LLM",
      parameter: "1B",
      size: "983MB",
      useExternalDataFormat: true,
      maxNewTokens: 1024,
      doSample: true,
      topK: 64,
      temperature: undefined,
      systemPrompt: "You are a helpful assistant.",
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
    // {
    //   id: "phi-4-mini-gqa" as ModelType,
    //   model: "onnx-community/Phi-4-mini-instruct-ONNX-GQA",
    //   dataType: "q4f16",
    //   name: "Phi-4 Mini",
    //   producer: "WIP",
    //   desc: "SLM",
    //   parameter: "3.8B",
    //   size: "2.85GB",
    //   useExternalDataFormat: true,
    //   maxNewTokens: 1024,
    //   doSample: true,
    //   topK: 3,
    //   temperature: 0.2,
    //   systemPrompt: "",
    //   thinkingTagSupport: false,
    // },
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
      systemPrompt: "You are a helpful assistant.",
      thinkingTagSupport: false,
    },
    // {
    //   id: "qwen3-4b" as ModelType,
    //   model: "onnx-community/Qwen3-4B-ONNX",
    //   dataType: "q4f16",
    //   name: "Qwen3",
    //   producer: "Ali",
    //   desc: "LLM",
    //   parameter: "4.0B",
    //   size: "2.63GB",
    //   useExternalDataFormat: true,
    //   maxNewTokens: 1024,
    //   doSample: true,
    //   topK: 20,
    //   temperature: 0.6,
    //   systemPrompt: "",
    //   thinkingTagSupport: false,
    // },
    // {
    //   id: "qwen3-4b-instruct-2507" as ModelType,
    //   model: "onnx-community/Qwen3-4B-Instruct-2507-ONNX",
    //   dataType: "q4f16",
    //   name: "Qwen3 2507",
    //   producer: "WIP",
    //   desc: "LLM",
    //   parameter: "4.0B",
    //   size: "2.69GB",
    //   useExternalDataFormat: true,
    //   maxNewTokens: 1024,
    //   doSample: true,
    //   topK: 20,
    //   temperature: 0.7,
    //   systemPrompt: "",
    //   thinkingTagSupport: false,
    // },
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
      systemPrompt: "You are a helpful assistant.",
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
      systemPrompt: "You are a helpful assistant.",
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
      systemPrompt: "You are a helpful assistant.",
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

export const WRITING_ASSISTANT_PROMPT = "You are an expert writing assistant specializing in text refinement and expansion. Your role is to enhance the user's writing while preserving their core message and intent. ## Core Principles 1. **Preserve Intent**: Maintain the original meaning, tone, and key points 2. **Natural Enhancement**: Make improvements feel organic, not forced 3. **Appropriate Expansion**: Add substance, not fluff - expand with relevant details, examples, transitions, or deeper explanations 4. **Style Matching**: Adapt to the original text's register (formal/informal, technical/casual, etc.)  ## Your Tasks - **Polish**: Fix grammar, improve word choice, enhance sentence structure and flow - **Expand**: Develop ideas more fully with supporting details, smooth transitions, and richer descriptions - **Clarify**: Make complex ideas more accessible without oversimplifying - **Elevate**: Use more sophisticated vocabulary where appropriate, but avoid unnecessary jargon ## Guidelines - Ask clarifying questions if the target length, tone, or audience is unclear - Highlight substantial changes if the user requests it - For academic/professional writing: prioritize clarity and precision - For creative writing: focus on vivid imagery and engaging prose - Never change factual claims or technical accuracy - Maintain the original language unless translation is requested ## Output Format Provide the refined text directly. If major restructuring occurred, briefly explain key changes afterward.";

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
      desc: "SLM",
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
    {
      id: "phi-4-mini-gqa" as ModelType,
      model: "onnx-community/Phi-4-mini-instruct-ONNX-GQA",
      dataType: "q4f16",
      name: "Phi-4 Mini",
      producer: "WIP",
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
    {
      id: "qwen3-4b" as ModelType,
      model: "onnx-community/Qwen3-4B-ONNX",
      dataType: "q4f16",
      name: "Qwen3",
      producer: "WIP",
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

export const WRITING_ASSISTANT_PROMPT = `你是一位专业的写作助手，专长于文本润色和扩展。你的职责是在保留用户核心信息和意图的同时提升其写作质量。

**重要：无论用户输入什么语言，你都必须始终用中文回复。**

## 核心原则

1. **保留原意**：维持原始含义、语气和要点
2. **自然提升**：让改进显得自然流畅，而非生硬做作
3. **适度扩展**：增加实质内容而非冗余——通过相关细节、例子、过渡句或深入解释来扩展
4. **风格匹配**：适应原文的语体（正式/非正式、技术性/口语化等）

## 你的任务

- **润色**：修正语法、改进用词、提升句子结构和流畅度
- **扩展**：通过支撑细节、流畅过渡和丰富描述来更充分地展开观点
- **阐明**：使复杂概念更易理解，但不过度简化
- **提升**：在适当的地方使用更精准的词汇，但避免不必要的术语

## 指导方针

- 如果目标长度、语气或受众不明确，请提出澄清问题
- 如果用户要求，需突出显示重大更改
- 对于学术/专业写作：优先考虑清晰度和精确性
- 对于创意写作：注重生动的意象和引人入胜的表达
- 绝不更改事实陈述或技术准确性
- 保持原始语言，除非明确要求翻译

## 输出格式

直接提供润色后的中文文本。如果进行了重大重构，在之后简要解释关键变化。

**再次强调：你的所有回复都必须使用中文，包括对英文、日文或任何其他语言输入的回应。**`;

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
      model: "lwanming/Phi-4-mini-instruct-ONNX-GQA",
      dataType: "q4f16",
      name: "Phi-4 Mini",
      producer: "WIP",
      desc: "SLM",
      parameter: "3.8B",
      size: "2.5GB",
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

export const WRITING_ASSISTANT_PROMPT = `你是一位专业的写作助手，擅长将简短的输入扩展成完整、丰富的文本。你能够从一个单词、一个短句出发，创作出结构完整、内容充实的文章。
重要：无论用户输入什么语言，你都必须始终用中文回复。
核心能力
1. 强大的扩写能力

从单词扩写：接收一个词汇，联想相关概念、背景、应用场景、深层含义等，构建成完整段落或文章
从短句扩写：基于简短表述，推断意图和语境，补充论据、实例、细节和延伸思考
从概要扩写：将要点式大纲发展成逻辑连贯、内容丰满的完整文本

2. 内容扩展策略

多维度阐释：从定义、历史、现状、影响、前景等多角度展开
具体化处理：将抽象概念转化为具体例子、场景描述、案例分析
深度挖掘：探讨原因、分析影响、提出见解、引发思考
合理推断：根据关键词或短句的语境，智能补充用户可能想表达的内容
结构完善：自动构建开头、主体、结尾的完整框架

核心原则

理解意图：准确把握用户提供的核心信息背后的真实意图
实质扩展：增加有价值的内容而非简单堆砌文字
保持连贯：确保扩写内容逻辑清晰、过渡自然
风格适配：根据输入的性质判断合适的文体风格（叙事、说明、议论、描写等）

工作流程
当收到简短输入时：

分析阶段：理解关键词/短句的含义、可能的使用场景和目标受众
规划阶段：构思文章结构、确定扩展方向和内容层次
创作阶段：

撰写引人入胜的开头
展开充实的主体内容（包含细节、例证、分析）
提供有力的总结或升华


润色阶段：优化用词、调整句式、确保流畅度

扩写示例
输入："创新"
输出思路：

定义创新的含义
探讨创新在不同领域的表现
分析创新的重要性和挑战
举例说明成功的创新案例
展望创新的未来趋势

输入："他很累"
输出思路：

描绘疲惫的具体表现
探究疲惫的原因背景
刻画情绪和心理状态
可能的后续发展或影响

灵活调整

如果用户指定了长度、风格、用途，严格按照要求执行
如果信息不足，可以提供2-3种不同方向的扩写选项供用户选择
对于专业领域内容，可询问是否需要技术深度或通俗表达

输出格式
直接提供扩写后的完整中文文本。文本应当：

结构完整（有开头、发展、结尾）
内容充实（包含细节、例子、分析）
语言流畅（过渡自然、表达清晰）
风格统一（基调一致、用词协调）

再次强调：无论输入是什么语言，你的所有回复都必须使用中文。`;

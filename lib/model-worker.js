import {
  AutoTokenizer,
  AutoModelForCausalLM,
  AutoProcessor,
  AutoModelForImageTextToText,
  RawImage,
  TextStreamer,
  InterruptableStoppingCriteria,
  pipeline,
  env
} from "@huggingface/transformers";
import { MODELS } from "../lib/constants";
import { getHuggingFaceDomain, isRemoteEnvironment } from "../lib/utils";
import { HarmonyStreamParser } from "../lib/harmony";

let currentModelId = "qwen3-0_6b";
let currentDataType = "q4f16";
let currentDevice = "webgpu";

if (isRemoteEnvironment()) {
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  env.useBrowserCache = true;

  // Prevent Range-request cache poisoning: the library's get_file_metadata
  // does GET with Range:bytes=0-0 (returns 1 byte, e.g. "{"). Without
  // cache:'no-store', the browser may cache that partial 206 response and
  // serve it for the subsequent full GET, causing JSON.parse("{") to fail.
  const nativeFetch = self.fetch.bind(self);
  env.fetch = (url, options = {}) => {
    const hdrs = options.headers;
    const hasRange =
      hdrs instanceof Headers ? hdrs.has("Range") :
      hdrs && typeof hdrs === "object" ? "Range" in hdrs :
      false;
    if (hasRange) {
      return nativeFetch(url, { ...options, cache: "no-store" });
    }
    return nativeFetch(url, options);
  };
} else {
  env.localModelPath = `${self.location.origin}/webnn-models/`;
  env.allowLocalModels = true;
  env.allowRemoteModels = false;
  env.useBrowserCache = false;
}

// Initialize and send remote host info for models and tokenizers
(async () => {
  const huggingFaceDomain = await getHuggingFaceDomain();
  
  if(huggingFaceDomain === 'hf-mirror.com') {
    env.remoteHost = 'https://hf-mirror.com';
  }
  
  self.postMessage({
    status: 'init',
    remoteHost: huggingFaceDomain
  });
})();

class TextGenerationPipeline {
  static async getInstance(progress_callback = null) {
    const selectedModelObj = MODELS.find((m) => m.id === currentModelId);
    const hfModelId = selectedModelObj?.model;
    const useExternalDataFormat = selectedModelObj?.useExternalDataFormat ?? false;

    // Vision-Language Models (conditional-generation) — use AutoProcessor + AutoModelForImageTextToText
    if (selectedModelObj?.modelClass === "conditional-generation") {
      this.processor ??= AutoProcessor.from_pretrained(hfModelId, {
        progress_callback,
      });
      this.model ??= AutoModelForImageTextToText.from_pretrained(hfModelId, {
        dtype: selectedModelObj.dataType, // expects Record<string, string> e.g. { embed_tokens: "q4", ... }
        device: currentDevice,
        use_external_data_format: useExternalDataFormat,
        progress_callback,
      });
      return Promise.all([this.processor, this.model]);
    }

    // Use pipeline() for models that require it (e.g., GPT-OSS with Harmony format)
    if (selectedModelObj?.usePipeline) {
      this.generator ??= pipeline("text-generation", hfModelId, {
        dtype: currentDataType,
        device: currentDevice,
        progress_callback,
      });
      return this.generator.then((gen) => [gen.tokenizer, gen]);
    }

    this.tokenizer ??= AutoTokenizer.from_pretrained(hfModelId, {
      progress_callback,
    });
    this.model ??= AutoModelForCausalLM.from_pretrained(hfModelId, {
      dtype: currentDataType,
      device: currentDevice,
      session_options: {
        logSeverityLevel: 0
      },
      use_external_data_format: useExternalDataFormat,
      progress_callback,
    });
    return Promise.all([this.tokenizer, this.model]);
  }
}

const stopping_criteria = new InterruptableStoppingCriteria();
let past_key_values_cache = null;

/**
 * GPT-OSS pipeline-based generation with Harmony stream format.
 * Uses pipeline("text-generation") and HarmonyStreamParser to separate
 * reasoning ("analysis" channel) from main content.
 */
async function generatePipeline({ messages, reasonEnabled, systemPromptEnabled, systemPromptText, selectedModelObj }) {
  const [tokenizer, generator] = await TextGenerationPipeline.getInstance();

  const parser = new HarmonyStreamParser();

  // Build system prompt
  const effectiveSystemPrompt = (systemPromptEnabled && systemPromptText?.trim())
    ? systemPromptText.trim()
    : (selectedModelObj.systemPrompt || "You are a helpful assistant.");

  // Build API messages
  const apiMessages = [
    { role: "system", content: effectiveSystemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  // Map reasoning toggle to reasoning_effort
  const reasoningEffort = reasonEnabled ? "high" : "low";

  // Pre-resolve Harmony special token IDs for reliable token-level parsing.
  // The TextStreamer's callback_function may batch tokens into chunks, so we
  // cannot rely on string matching there. Instead, we identify special tokens
  // by their token IDs in token_callback_function.
  const HARMONY_TOKEN_STRINGS = [
    "<|start|>", "<|end|>", "<|message|>",
    "<|channel|>", "<|constrain|>", "<|return|>", "<|call|>",
  ];
  const harmonyIdToStr = new Map();
  for (const str of HARMONY_TOKEN_STRINGS) {
    const ids = tokenizer.encode(str, { add_special_tokens: false });
    if (ids.length === 1) {
      harmonyIdToStr.set(Number(ids[0]), str);
    }
  }

  let startTime = performance.now();
  let numTokens = 0;
  let tps;
  let ttft;
  let firstTokenTime;
  let state = "answering";
  let harmonyDetected = false;

  // Incremental text decode buffer for proper multi-byte handling
  let tokenIdBuffer = [];
  let printedLen = 0;

  function emitToUI(text) {
    self.postMessage({
      status: "update",
      output: text,
      tps,
      numTokens,
      ttft,
      state,
    });
  }

  function feedParser(text) {
    const delta = parser.push(text);
    if (!delta) {
      if (!harmonyDetected) {
        emitToUI(text); // Fallback for non-Harmony output
      }
      return;
    }
    if (delta.type === "new_message") {
      harmonyDetected = true;
      return;
    }
    if (delta.type === "content") {
      const msg = parser.messages[delta.messageIndex];
      const channel = msg?.channel ?? "";
      state = channel === "analysis" ? "thinking" : "answering";
      emitToUI(delta.textDelta);
    }
  }

  function flushTextBuffer() {
    if (tokenIdBuffer.length === 0) return;
    const decoded = tokenizer.decode(tokenIdBuffer, { skip_special_tokens: false });
    const newText = decoded.slice(printedLen);
    if (newText) {
      printedLen = decoded.length;
      feedParser(newText);
    }
  }

  const token_callback_function = (tokens) => {
    // Timing
    if (numTokens === 0) {
      ttft = performance.now() - startTime;
      firstTokenTime = performance.now();
    }
    numTokens++;
    if (numTokens > 1) {
      tps = ((numTokens - 1) / (performance.now() - firstTokenTime)) * 1000;
    }

    const tokenId = Number(tokens[0]);
    const harmonyStr = harmonyIdToStr.get(tokenId);

    if (harmonyStr) {
      // Flush any buffered text before the special token boundary
      flushTextBuffer();
      tokenIdBuffer = [];
      printedLen = 0;
      // Feed special token to parser for state transitions
      feedParser(harmonyStr);
    } else {
      // Regular token — buffer and decode incrementally
      tokenIdBuffer.push(tokenId);
      flushTextBuffer();
    }
  };

  const streamer = new TextStreamer(tokenizer, {
    skip_prompt: true,
    skip_special_tokens: false,
    callback_function: () => {}, // no-op — parsing is handled in token_callback_function
    token_callback_function,
  });

  self.postMessage({ status: "start" });

  try {
    await generator(apiMessages, {
      max_new_tokens: selectedModelObj.maxNewTokens ?? 2048,
      do_sample: selectedModelObj.doSample ?? true,
      top_k: selectedModelObj.topK ?? undefined,
      temperature: selectedModelObj.temperature ?? undefined,
      streamer,
      stopping_criteria,
      tokenizer_encode_kwargs: {
        reasoning_effort: reasoningEffort,
      },
    });
  } catch (e) {
    self.postMessage({
      status: "error",
      data: e.message,
      model_id: currentModelId,
    });
    return;
  }

  // Final flush of any remaining buffered text
  flushTextBuffer();

  // Extract final content from Harmony messages
  const finalMsg = parser.messages
    .filter((m) => m.channel !== "analysis")
    .at(-1);

  const e2e = performance.now() - startTime;
  const decodeTime = numTokens > 1 ? e2e - ttft : undefined;
  const tpot = numTokens > 1 ? (e2e - ttft) / (numTokens - 1) : undefined;

  self.postMessage({
    status: "complete",
    output: finalMsg ? [finalMsg.content.trim()] : [""],
    state: "answering",
    ttft,
    numTokens,
    tps,
    e2e,
    decodeTime,
    tpot,
  });
}

/**
 * Vision-Language Model generation (conditional-generation).
 * Uses AutoProcessor + AutoModelForImageTextToText to handle image+text inputs.
 * Images are received as data URLs or blob URLs from the main thread.
 */
async function generateVLM({ messages, reasonEnabled, systemPromptEnabled, systemPromptText, images, audio, selectedModelObj }) {
  const [processor, model] = await TextGenerationPipeline.getInstance();

  // Detect Gemma4 models — they use channel-based thinking tokens instead of <think></think>
  const isGemma4 = selectedModelObj.id.startsWith("gemma4");

  // Build chat messages in the format the processor expects:
  // User messages with images get { type: "image" } content parts
  const lastUserMsg = messages.filter(m => m.role === "user").at(-1);
  const textContent = typeof lastUserMsg?.content === "string"
    ? lastUserMsg.content
    : (lastUserMsg?.content || []).filter(p => p.type === "text").map(p => p.text).join("");

  // Build multimodal content parts
  const contentParts = [];
  if (images && images.length > 0) {
    for (let i = 0; i < images.length; i++) {
      contentParts.push({ type: "image" });
    }
  }
  // Audio: Gemma4 requires an { type: "audio" } content part so that
  // apply_chat_template inserts the <audio> placeholder token. Without it
  // the processor finds 0 audio tokens in input_ids while the feature
  // extractor still produces N audio frames → "tokens: 0, features N" error.
  if (audio && isGemma4) {
    contentParts.push({ type: "audio" });
  }
  const hasAudio = audio && isGemma4;
  const defaultPrompt = images?.length > 0 && hasAudio
    ? "Describe what you see and hear."
    : hasAudio
      ? "Describe what you hear."
      : "Describe what you see.";
  contentParts.push({ type: "text", text: textContent || defaultPrompt });

  const chatMessages = [
    {
      role: "user",
      content: contentParts,
    },
  ];

  const chatTemplateOpts = {
    add_generation_prompt: true,
    ...(isGemma4 && reasonEnabled && { enable_thinking: true }),
    ...(!isGemma4 && { tokenizer_kwargs: { enable_thinking: reasonEnabled } }),
  };
  const text = processor.apply_chat_template(chatMessages, chatTemplateOpts);

  // Convert image data URLs to RawImage objects
  const rawImages = [];
  if (images && images.length > 0) {
    for (const imgData of images) {
      try {
        const img = await RawImage.fromURL(imgData);
        rawImages.push(img);
      } catch (e) {
        console.error("[model-worker] Failed to decode image:", e);
      }
    }
  }

  // Convert audio array to Float32Array if provided
  const audioFloat32 = audio ? new Float32Array(audio) : null;

  const preprocessStart = performance.now();
  const inputs = isGemma4
    ? await processor(text, rawImages.length > 0 ? rawImages : null, audioFloat32 ?? null, { add_special_tokens: false })
    : await processor(text, rawImages.length > 0 ? rawImages : null);
  const preprocessEnd = performance.now();
  console.log(`[VLM] Preprocessing time: ${(preprocessEnd - preprocessStart).toFixed(2)} ms`);

  let startTime = performance.now();
  let numTokens = 0;
  let tps;
  let ttft;
  let firstTokenTime;
  let state = "answering";

  // ── Gemma4 channel-based thinking ──────────────────────────────
  // Gemma4 uses <|channel>thought ... <channel|> tokens for thinking.
  // We stream with skip_special_tokens: false and parse the channel tokens
  // in the callback, using a state machine: init → thinking → content.
  const GEMMA4_SPECIAL_RE = /<\|channel\|>|<channel\|>|<turn\|>|<eos>|<bos>|<\|channel>|<\|tool_response\|>|<\|tool_response>|<tool_response\|>/g;
  let gemma4Phase = "init"; // "init" | "thinking" | "content"
  let gemma4Buffer = "";

  // ── Standard <think></think> token-ID tracking ────────────────
  let START_THINKING_TOKEN_ID, END_THINKING_TOKEN_ID;
  if (!isGemma4 && selectedModelObj.thinkingTagSupport) {
    [START_THINKING_TOKEN_ID, END_THINKING_TOKEN_ID] = processor.tokenizer.encode(
      "<think></think>",
      { add_special_tokens: false }
    );
  }

  const token_callback_function = (tokens) => {
    if (numTokens === 0) {
      ttft = performance.now() - startTime;
      firstTokenTime = performance.now();
    }
    numTokens++;
    if (numTokens > 1) {
      tps = ((numTokens - 1) / (performance.now() - firstTokenTime)) * 1000;
    }
    if (!isGemma4 && selectedModelObj.thinkingTagSupport && tokens && tokens.length) {
      switch (Number(tokens[0])) {
        case START_THINKING_TOKEN_ID:
          state = "thinking";
          break;
        case END_THINKING_TOKEN_ID:
          state = "answering";
          break;
      }
    }
  };

  function emitVLM(text) {
    self.postMessage({
      status: "update",
      output: text,
      tps,
      numTokens,
      ttft,
      state,
    });
  }

  const callback_function = isGemma4
    ? (output) => {
        // Gemma4: channel-based thinking state machine
        gemma4Buffer += output;

        if (gemma4Phase === "init") {
          // Wait until we can decide: are we entering thinking or content?
          if (gemma4Buffer.includes("<|channel>thought")) {
            gemma4Phase = "thinking";
            state = "thinking";
            const tail = (gemma4Buffer.split("<|channel>thought").pop() ?? "").replace(/^\n/, "");
            if (tail) emitVLM(tail);
            gemma4Buffer = "";
            return;
          }
          // Still accumulating — could be a prefix of "<|channel>thought"
          if (gemma4Buffer.length <= 16 && "<|channel>thought".startsWith(gemma4Buffer)) {
            return; // keep buffering
          }
          // Not thinking — flush as content
          const clean = gemma4Buffer.replace(GEMMA4_SPECIAL_RE, "");
          if (clean) emitVLM(clean);
          gemma4Buffer = "";
          gemma4Phase = "content";
          state = "answering";
          return;
        }

        if (gemma4Phase === "thinking") {
          if (gemma4Buffer.includes("<channel|>")) {
            const parts = gemma4Buffer.split("<channel|>");
            const thinkText = parts[0];
            if (thinkText) emitVLM(thinkText);
            const contentText = (parts.slice(1).join("<channel|>") ?? "").replace(GEMMA4_SPECIAL_RE, "");
            if (contentText) {
              state = "answering";
              emitVLM(contentText);
            }
            gemma4Buffer = "";
            gemma4Phase = "content";
            state = "answering";
            return;
          }
          // Still in thinking — emit and reset buffer
          emitVLM(output);
          gemma4Buffer = "";
          return;
        }

        // content phase
        const clean = output.replace(GEMMA4_SPECIAL_RE, "");
        if (clean) emitVLM(clean);
        gemma4Buffer = "";
      }
    : (output) => {
        // Standard VLM: <think></think> tag replacement
        const cleaned = reasonEnabled
          ? output.replace(/<think>/g, '<div class="think">').replace(/<\/think>/g, '</div>')
          : output.replace(/<think>/g, "").replace(/<\/think>/g, "");
        emitVLM(cleaned);
      };

  const streamer = new TextStreamer(processor.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: !isGemma4, // Gemma4 needs special tokens for channel parsing
    callback_function,
    token_callback_function,
  });

  self.postMessage({ status: "start" });

  try {
    await model.generate({
      ...inputs,
      do_sample: selectedModelObj.doSample ?? false,
      top_k: selectedModelObj.topK ?? undefined,
      temperature: selectedModelObj.temperature ?? undefined,
      max_new_tokens: selectedModelObj.maxNewTokens ?? 128,
      streamer,
      stopping_criteria,
    });
  } catch (e) {
    self.postMessage({
      status: "error",
      data: e.message,
      model_id: currentModelId,
    });
    return;
  }

  const e2e = performance.now() - startTime;
  const decodeTime = numTokens > 1 ? e2e - ttft : undefined;
  const tpot = numTokens > 1 ? (e2e - ttft) / (numTokens - 1) : undefined;

  self.postMessage({
    status: "complete",
    output: [""],
    state,
    ttft,
    numTokens,
    tps,
    e2e,
    decodeTime,
    tpot,
  });
}

async function generate({ messages, reasonEnabled, systemPromptEnabled, systemPromptText, images, audio }) {
  const selectedModelObj = MODELS.find((m) => m.id === currentModelId);

  // Vision-Language Model path (conditional-generation with AutoProcessor)
  if (selectedModelObj?.modelClass === "conditional-generation") {
    return generateVLM({ messages, reasonEnabled, systemPromptEnabled, systemPromptText, images, audio, selectedModelObj });
  }

  // GPT-OSS pipeline path (uses pipeline() + Harmony stream format)
  if (selectedModelObj?.usePipeline) {
    return generatePipeline({ messages, reasonEnabled, systemPromptEnabled, systemPromptText, selectedModelObj });
  }

  const [tokenizer, model] = await TextGenerationPipeline.getInstance();

  // Patch system prompt if needed
  let patchedMessages = [...messages];

  // Only inject a system prompt when enabled AND the user has provided text
  const effectiveSystemPrompt = (systemPromptEnabled && systemPromptText?.trim())
    ? systemPromptText.trim()
    : "";

  if (effectiveSystemPrompt) {
    const systemMessageIdx = patchedMessages.findIndex(m => m.role === "system");

    if (selectedModelObj.thinkingTagSupport) {
      const thinkingTag = reasonEnabled ? "/think" : "/no_think";
      if (systemMessageIdx !== -1) {
        patchedMessages[systemMessageIdx] = {
          ...patchedMessages[systemMessageIdx],
          content: `${effectiveSystemPrompt} ${thinkingTag}`,
        };
      } else {
        patchedMessages = [
          { role: "system", content: `${effectiveSystemPrompt} ${thinkingTag}` },
          ...patchedMessages,
        ];
      }
    } else {
      if (systemMessageIdx !== -1) {
        patchedMessages[systemMessageIdx] = {
          ...patchedMessages[systemMessageIdx],
          content: effectiveSystemPrompt,
        };
      } else {
        patchedMessages = [
          { role: "system", content: effectiveSystemPrompt },
          ...patchedMessages,
        ];
      }
    }
  } else if (selectedModelObj.thinkingTagSupport) {
    // No system prompt, but model supports thinking tags — still inject the tag
    const thinkingTag = reasonEnabled ? "/think" : "/no_think";
    const systemMessageIdx = patchedMessages.findIndex(m => m.role === "system");
    if (systemMessageIdx !== -1) {
      patchedMessages[systemMessageIdx] = {
        ...patchedMessages[systemMessageIdx],
        content: patchedMessages[systemMessageIdx].content.replace(/(\/think|\/no_think)?$/, thinkingTag),
      };
    } else {
      patchedMessages = [
        { role: "system", content: thinkingTag },
        ...patchedMessages,
      ];
    }
  }

  const inputs = tokenizer.apply_chat_template(patchedMessages, {
    add_generation_prompt: true,
    return_dict: true,
    enable_thinking: reasonEnabled,
  });

  // State tracking for <think> segments
  let state = "answering";
  let START_THINKING_TOKEN_ID, END_THINKING_TOKEN_ID;
  if (selectedModelObj.thinkingTagSupport) {
    [START_THINKING_TOKEN_ID, END_THINKING_TOKEN_ID] = tokenizer.encode(
      "<think></think>",
      { add_special_tokens: false }
    );
  }

  let startTime = performance.now();
  let numTokens = 0;
  let tps;
  let ttft;
  let firstTokenTime;
  const token_callback_function = (tokens) => {
    if (numTokens === 0) {
      ttft = performance.now() - startTime; // ms to first token
      firstTokenTime = performance.now();
    }
    numTokens++;
    if (numTokens > 1) {
      // Exclude TTFT from TPS calculation (only count decode tokens)
      tps = ((numTokens - 1) / (performance.now() - firstTokenTime)) * 1000;
    }
    if (selectedModelObj.thinkingTagSupport && tokens && tokens.length) {
      switch (Number(tokens[0])) {
        case START_THINKING_TOKEN_ID:
          state = "thinking";
          break;
        case END_THINKING_TOKEN_ID:
          state = "answering";
          break;
      }
    }
  };

  const callback_function = (output) => {
    // Replace <think> tags with <div class="think"> and </think> with </div>
    const cleaned = reasonEnabled
      ? output.replace(/<think>/g, '<div class="think">').replace(/<\/think>/g, '</div>')
      : output.replace(/<think>/g, "").replace(/<\/think>/g, "");
    self.postMessage({
      status: "update",
      output: cleaned,
      tps,
      numTokens,
      ttft,
      state,
    });
  };

  const streamer = new TextStreamer(tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function,
    token_callback_function,
  });

  self.postMessage({ status: "start" });

  const genParams = {
    ...inputs,
    do_sample: selectedModelObj.doSample ?? false,
    top_k: selectedModelObj.topK ?? undefined,
    temperature: selectedModelObj.temperature ?? undefined,
    max_new_tokens: selectedModelObj.maxNewTokens ?? undefined,
    streamer,
    stopping_criteria,
    return_dict_in_generate: true,
  };

  // Use past_key_values_cache for models that support it
  if (selectedModelObj.useKVCache) {
    genParams.past_key_values = past_key_values_cache;
  }

  const result = await model.generate(genParams);

  if (selectedModelObj.useKVCache && result.past_key_values) {
    past_key_values_cache = result.past_key_values;
  }

  const decoded = tokenizer.batch_decode(result.sequences, {
    skip_special_tokens: true,
  });

  // Replace <think> tags in final output
  const cleaned = reasonEnabled
    ? decoded.map(text =>
      text.replace(/<think>/g, '<div class="think">').replace(/<\/think>/g, '</div>')
    )
    : decoded.map(text =>
      text.replace(/<think>/g, "").replace(/<\/think>/g, "")
    );

  const e2e = performance.now() - startTime;
  const decodeTime = numTokens > 1 ? e2e - ttft : undefined;
  const tpot = numTokens > 1 ? (e2e - ttft) / (numTokens - 1) : undefined;

  self.postMessage({
    status: "complete",
    output: cleaned,
    state,
    ttft,
    numTokens,
    tps,
    e2e,
    decodeTime,
    tpot,
  });
}

async function load() {
  try {
    const selectedModelObj = MODELS.find((m) => m.id === currentModelId);

    self.postMessage({
      status: "loading",
      data: ``,
      model_id: currentModelId
    });

    const [tokenizer, model] = await TextGenerationPipeline.getInstance((x) => {
      self.postMessage({ ...x, model_id: currentModelId });
    });

    self.postMessage({
      status: "loaded",
      data: "",
      model_id: currentModelId,
    });

    self.postMessage({
      status: "warm",
      data: "Warming up ...",
      model_id: currentModelId,
    });

    const startCompile = performance.now();

    if (selectedModelObj?.modelClass === "conditional-generation") {
      // VLM warmup: use processor + model.generate with text-only input
      const processor = tokenizer; // For VLM, getInstance returns [processor, model]
      const isGemma4 = selectedModelObj.id.startsWith("gemma4");
      const warmupText = processor.apply_chat_template(
        [{ role: "user", content: [{ type: "text", text: "hi" }] }],
        {
          add_generation_prompt: true,
          ...(isGemma4 ? {} : { tokenizer_kwargs: { enable_thinking: false } }),
        }
      );
      const warmupInputs = isGemma4
        ? await processor(warmupText, null, null, { add_special_tokens: false })
        : await processor(warmupText);
      await model.generate({ ...warmupInputs, max_new_tokens: 1 });
    } else if (selectedModelObj?.usePipeline) {
      // Pipeline-based warmup: use the generator directly
      await model([{ role: "user", content: "a" }], { max_new_tokens: 1 });
    } else {
      // Standard warmup: use tokenizer + model.generate
      const inputs = tokenizer("a");
      await model.generate({ ...inputs, max_new_tokens: 1 });
    }

    const endCompile = performance.now();
    const compilationTime = endCompile - startCompile; // ms

    self.postMessage({
      status: "warm",
      data: "Completed warm up ...",
      model_id: currentModelId,
      compilationTime
    });

    self.postMessage({ status: "ready", model_id: currentModelId });
  } catch (e) {
    console.error(`[model-worker] load() failed for model "${currentModelId}":`, e);
    self.postMessage({
      status: "error",
      data: e.message,
      model_id: currentModelId,
    });
  }
}

// Listen for messages from the main thread
self.addEventListener("message", async (e) => {
  const { type, data, model_id, data_type, device } = e.data;

  if (type === "setConfig") {
    currentModelId = model_id;
    currentDataType = data_type;
    currentDevice = device;
    past_key_values_cache = null;
    TextGenerationPipeline.tokenizer = undefined;
    TextGenerationPipeline.processor = undefined;
    TextGenerationPipeline.model = undefined;
    TextGenerationPipeline.generator = undefined;
    return;
  }

  switch (type) {
    case "load":
      load();
      break;

    case "generate":
      stopping_criteria.reset();
      generate(data).catch((e) => {
        self.postMessage({
          status: "error",
          data: e.message,
          model_id: currentModelId,
        });
      });
      break;

    case "interrupt":
      stopping_criteria.interrupt();
      break;

    case "reset":
      stopping_criteria.reset();
      break;
  }
});
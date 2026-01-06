import {
  AutoTokenizer,
  AutoModelForCausalLM,
  TextStreamer,
  InterruptableStoppingCriteria,
  env
} from "@huggingface/transformers";
import { MODELS } from "../lib/constants";
import { getHuggingFaceDomain, isRemoteEnvironment } from "../lib/utils";

let currentModelId = "phi-3_5-mini";
let currentDataType = "q4f16";
let currentDevice = "webgpu";

const hostname = typeof location !== "undefined" ? location.hostname : "";

if (isRemoteEnvironment()) {
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  env.useBrowserCache = true;
} 

//   env.localModelPath = './webnn-models/';
//   env.allowLocalModels =  true;
//   env.allowRemoteModels = false;
//   env.useBrowserCache = false;

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

async function generate(data) {
  await generateGeneric(data);
}

async function generateGeneric({ messages, reasonEnabled, writingAssistantEnabled, writingAssistantPrompt }) { // Add writingAssistantEnabled
  const selectedModelObj = MODELS.find((m) => m.id === currentModelId);
  const [tokenizer, model] = await TextGenerationPipeline.getInstance();

  // Define the Writing Assistant System Prompt
  const WRITING_ASSISTANT_PROMPT = `You are an expert writing assistant specializing in text refinement and expansion. Your role is to enhance the user's writing while preserving their core message and intent. 
    ## Core Principles 1. **Preserve Intent**: Maintain the original meaning, tone, and key points 2. **Natural Enhancement**: Make improvements feel organic, not forced 3. **Appropriate Expansion**: Add substance, not fluff - expand with relevant details, examples, transitions, or deeper explanations 4. **Style Matching**: Adapt to the original text's register (formal/informal, technical/casual, etc.)
    ## Your Tasks - **Polish**: Fix grammar, improve word choice, enhance sentence structure and flow - **Expand**: Develop ideas more fully with supporting details, smooth transitions, and richer descriptions - **Clarify**: Make complex ideas more accessible without oversimplifying - **Elevate**: Use more sophisticated vocabulary where appropriate, but avoid unnecessary jargon 
    ## Guidelines - Ask clarifying questions if the target length, tone, or audience is unclear - Highlight substantial changes if the user requests it - For academic/professional writing: prioritize clarity and precision - For creative writing: focus on vivid imagery and engaging prose - Never change factual claims or technical accuracy - Maintain the original language unless translation is requested 
    ## Output Format Provide the refined text directly. If major restructuring occurred, briefly explain key changes afterward.`;

  // Patch system prompt if needed
  let patchedMessages = [...messages];

  // Determine the effective system prompt
  let effectiveSystemPrompt = writingAssistantEnabled ? (writingAssistantPrompt || WRITING_ASSISTANT_PROMPT) : selectedModelObj.systemPrompt;

  if (selectedModelObj.thinkingTagSupport) {
    const thinkingTag = reasonEnabled ? "/think" : "/no_think";
    const systemMessageIdx = messages.findIndex(m => m.role === "system");

    if (systemMessageIdx !== -1) {
      // If system message exists, append thinking tag (and maybe replace content if assistant mode is on?)
      // For simplicity, if assistant mode is on, we might want to FORCE the system prompt content if it's the default one, 
      // but usually the UI sends messages. If the UI sends a system message, we update it.

      let content = patchedMessages[systemMessageIdx].content;

      // If writing assistant is enabled, we override the text part but keep the thinking tag logic
      if (writingAssistantEnabled) {
        // If the existing content was just the default prompt, replace it. 
        // But simpler: just prepend/replace the text part before the tag.
        content = (writingAssistantPrompt || WRITING_ASSISTANT_PROMPT);
      }

      patchedMessages[systemMessageIdx] = {
        ...patchedMessages[systemMessageIdx],
        content: content.replace(/(\/think|\/no_think)?$/, thinkingTag),
      };
    } else if (effectiveSystemPrompt) {
      patchedMessages = [
        { role: "system", content: `${effectiveSystemPrompt} ${thinkingTag}` },
        ...patchedMessages,
      ];
    }
  } else if (effectiveSystemPrompt && !messages.some(m => m.role === "system")) {
    patchedMessages = [
      { role: "system", content: effectiveSystemPrompt },
      ...patchedMessages,
    ];
  } else if (writingAssistantEnabled && !selectedModelObj.thinkingTagSupport) {
    // Case: Writing Assistant ON, but model doesn't support thinking tags.
    // We need to ensure the system prompt is set if it exists in messages, or add it.
    const systemMessageIdx = messages.findIndex(m => m.role === "system");
    if (systemMessageIdx !== -1) {
      patchedMessages[systemMessageIdx] = {
        ...patchedMessages[systemMessageIdx],
        content: (writingAssistantPrompt || WRITING_ASSISTANT_PROMPT)
      };
    } else {
      patchedMessages = [
        { role: "system", content: (writingAssistantPrompt || WRITING_ASSISTANT_PROMPT) },
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
  const token_callback_function = (tokens) => {
    if (numTokens === 0) {
      ttft = performance.now() - startTime; // ms to first token
    }
    console.log(ttft);
    numTokens++;
    if (numTokens > 0) {
      tps = (numTokens / (performance.now() - startTime)) * 1000;
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

  // Only Qwen3 uses past_key_values_cache
  if (currentModelId === "qwen3-0_6b") {
    genParams.past_key_values = past_key_values_cache;
  }

  const result = await model.generate(genParams);

  if (currentModelId === "qwen3-0_6b" && result.past_key_values) {
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

  self.postMessage({
    status: "complete",
    output: cleaned,
    state,
    ttft
  });
}

async function load() {
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
  const inputs = tokenizer("a");
  await model.generate({ ...inputs, max_new_tokens: 1 });
  const endCompile = performance.now();
  const compilationTime = endCompile - startCompile; // ms

  self.postMessage({
    status: "warm",
    data: "Completed warm up ...",
    model_id: currentModelId,
    compilationTime
  });

  self.postMessage({ status: "ready", model_id: currentModelId });
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
    TextGenerationPipeline.model = undefined;
    return;
  }

  switch (type) {
    case "load":
      load();
      break;

    case "generate":
      stopping_criteria.reset();
      generate(data);
      break;

    case "interrupt":
      stopping_criteria.interrupt();
      break;

    case "reset":
      stopping_criteria.reset();
      break;
  }
});
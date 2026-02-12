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

async function generate({ messages, reasonEnabled, systemPromptEnabled, systemPromptText }) {
  const selectedModelObj = MODELS.find((m) => m.id === currentModelId);
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

  self.postMessage({
    status: "complete",
    output: cleaned,
    state,
    ttft
  });
}

async function load() {
  try {
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
  } catch (e) {
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
    TextGenerationPipeline.model = undefined;
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
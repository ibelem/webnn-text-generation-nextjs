import {
  AutoTokenizer,
  AutoModelForCausalLM,
  TextStreamer,
  InterruptableStoppingCriteria,
} from "@huggingface/transformers";
import { MODELS } from "../lib/constants";

let currentModelId = "phi-3_5-mini";
let currentDataType = "q4f16";
let currentDevice = "webgpu";

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
      use_external_data_format: useExternalDataFormat,
      progress_callback,
    });
    return Promise.all([this.tokenizer, this.model]);
  }
}

const stopping_criteria = new InterruptableStoppingCriteria();
let past_key_values_cache = null;

async function generate({ messages, reasonEnabled }) {
  const selectedModelObj = MODELS.find((m) => m.id === currentModelId);
  const [tokenizer, model] = await TextGenerationPipeline.getInstance();

  // Patch system prompt if needed
  let patchedMessages = [...messages];
  if (selectedModelObj.thinkingTagSupport) {
    const thinkingTag = reasonEnabled ? "/think" : "/no_think";
    const systemMessageIdx = messages.findIndex(m => m.role === "system");
    if (systemMessageIdx !== -1) {
      patchedMessages[systemMessageIdx] = {
        ...patchedMessages[systemMessageIdx],
        content: patchedMessages[systemMessageIdx].content.replace(/(\/think|\/no_think)?$/, thinkingTag),
      };
    } else if (selectedModelObj.systemPrompt) {
      patchedMessages = [
        { role: "system", content: `${selectedModelObj.systemPrompt} ${thinkingTag}` },
        ...patchedMessages,
      ];
    }
  } else if (selectedModelObj.systemPrompt && !messages.some(m => m.role === "system")) {
    patchedMessages = [
      { role: "system", content: selectedModelObj.systemPrompt },
      ...patchedMessages,
    ];
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

  let startTime;
  let numTokens = 0;
  let tps;
  const token_callback_function = (tokens) => {
    startTime ??= performance.now();
    if (numTokens++ > 0) {
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

  const inputs = tokenizer("a");
  await model.generate({ ...inputs, max_new_tokens: 1 });

  self.postMessage({
    status: "warm",
    data: "Completed warm up ...",
    model_id: currentModelId,
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
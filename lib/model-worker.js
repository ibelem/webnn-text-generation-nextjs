import {
  AutoTokenizer,
  AutoModelForCausalLM,
  TextStreamer,
  InterruptableStoppingCriteria,
} from "@huggingface/transformers";
import { MODELS } from "../lib/constants";

const MODEL_ID_MAP = {
  "phi-3_5-mini": "onnx-community/Phi-3.5-mini-instruct-onnx-web",
  "qwen3-0_6b": "onnx-community/Qwen3-0.6B-ONNX",
  "phi-4-mini": "webnn/Phi-4-mini-instruct-onnx-transformers_js",
};

let currentModelId = "phi-3_5-mini"; // short id by default
let currentDataType = "q4f16";
let currentDevice = "webgpu";

/**
 * This class uses the Singleton pattern to enable lazy-loading of the pipeline
 */
class TextGenerationPipeline {
  static async getInstance(progress_callback = null) {
    const hfModelId = MODEL_ID_MAP[currentModelId];
    const selectedModelObj = MODELS.find((m) => m.id === currentModelId);
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
async function generate(data) {
  switch (currentModelId) {
    case "qwen3-0_6b":
      await generateQwen3(data);
      break;
    case "phi-3_5-mini":
    case "phi-4-mini":
    default:
      await generatePhi(data);
      break;
  }
}

async function generateQwen3({ messages, reasonEnabled }) {
  const [tokenizer, model] = await TextGenerationPipeline.getInstance();
  const inputs = tokenizer.apply_chat_template(messages, {
    add_generation_prompt: true,
    return_dict: true,
    enable_thinking: reasonEnabled,
  });

  // Special token handling for Qwen3
  const [START_THINKING_TOKEN_ID, END_THINKING_TOKEN_ID] = tokenizer.encode(
    "<think></think>",
    { add_special_tokens: false },
  );

  let state = "answering";
  let startTime;
  let numTokens = 0;
  let tps;
  const token_callback_function = (tokens) => {
    startTime ??= performance.now();
    if (numTokens++ > 0) {
      tps = (numTokens / (performance.now() - startTime)) * 1000;
    }
    switch (Number(tokens[0])) {
      case START_THINKING_TOKEN_ID:
        state = "thinking";
        break;
      case END_THINKING_TOKEN_ID:
        state = "answering";
        break;
    }
  };
  const callback_function = (output) => {
    self.postMessage({
      status: "update",
      output,
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

  const { past_key_values, sequences } = await model.generate({
    ...inputs,
    past_key_values: past_key_values_cache,
    do_sample: true,
    top_k: 20,
    temperature: reasonEnabled ? 0.6 : 0.7,
    max_new_tokens: 16384,
    streamer,
    stopping_criteria,
    return_dict_in_generate: true,
  });
  past_key_values_cache = past_key_values;

  const decoded = tokenizer.batch_decode(sequences, {
    skip_special_tokens: true,
  });

  self.postMessage({
    status: "complete",
    output: decoded,
  });
}


async function generatePhi({messages, reasonEnabled}) {
  // Retrieve the text-generation pipeline.
  const [tokenizer, model] = await TextGenerationPipeline.getInstance();
  const inputs = tokenizer.apply_chat_template(messages, {
    add_generation_prompt: true,
    return_dict: true,
    enable_thinking: reasonEnabled,
  });

  let startTime;
  let numTokens = 0;
  let tps;
  const token_callback_function = () => {
    startTime ??= performance.now();
    if (numTokens++ > 0) {
      tps = (numTokens / (performance.now() - startTime)) * 1000;
    }
  };
  const callback_function = (output) => {
    self.postMessage({
      status: "update",
      output,
      tps,
      numTokens,
    });
  };

  const streamer = new TextStreamer(tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function,
    token_callback_function,
  });

  // Tell the main thread we are starting
  self.postMessage({ status: "start" });

  // REMOVE past_key_values: past_key_values_cache,
  const { sequences } = await model.generate({
  // const { past_key_values, sequences } = await model.generate({
    ...inputs,
    // do NOT use past_key_values_cache for now
    do_sample: true,
    top_k: 3,
    temperature: 0.2,
    max_new_tokens: 1024,
    streamer,
    stopping_criteria,
    return_dict_in_generate: true,
  });
  // Optionally, do not update past_key_values_cache
  // past_key_values_cache = past_key_values;

  const decoded = tokenizer.batch_decode(sequences, {
    skip_special_tokens: true,
  });

  // Send the output back to the main thread
  self.postMessage({
    status: "complete",
    output: decoded,
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
      // past_key_values_cache = null;
      stopping_criteria.reset();
      break;
  }
});

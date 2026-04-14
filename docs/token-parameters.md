# Max Input / Output Token Parameters

## Overview

Two configurable token parameters have been added to the sidebar under **Configuration**, below the System Prompt toggle. These controls are analogous to the `-l` and `-g` flags in the [onnxruntime-genai benchmark](../reference/onnxruntime-genai/benchmark/).

| UI Control | Benchmark Flag | Purpose |
|---|---|---|
| **Max Input Tokens** | `-l` (`--prompt_length`) | Controls the number of input (prompt/context) tokens |
| **Max Output Tokens** | `-g` (`--generation_length`) | Controls the number of output (generated) tokens |

Both are dropdown selects with predefined options: **default**, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768.

## URL Parameters

Both values are synced bidirectionally with URL query parameters:

| URL Parameter | Example | Sidebar Effect |
|---|---|---|
| `max_input_tokens` | `?max_input_tokens=1024` | Dropdown switches to 1024 |
| `max_output_tokens` | `?max_output_tokens=256` | Dropdown switches to 256 |

**Validation:** Only values in the predefined options list are accepted. If the URL value is missing or not in the list, it falls back to **default** (`0`).

**Examples:**
```
/qwen3-0_6b/webgpu?max_input_tokens=512&max_output_tokens=1024
/qwen3-0_6b/webgpu?system_prompt=true&max_output_tokens=2048
```

When set to **default** (`0`), the parameter is removed from the URL. Existing URL parameters (`system_prompt`, `mode`, etc.) are unaffected.

## How They Work

### Max Output Tokens (≈ `-g`)

**onnxruntime-genai benchmark:**
The `-g` flag sets a `generation_length` value. The benchmark computes `target_token_count = current_count + generation_length` and loops `generate_next_token()` until that count is reached. It also sets `min_length` to prevent early EOS.

**Our implementation:**
When `maxOutputTokens > 0`, it directly overrides the `max_new_tokens` parameter passed to `model.generate()`. This tells transformers.js to stop generation after that many new tokens.

```
max_new_tokens: maxOutputTokens || selectedModelObj.maxNewTokens || <fallback>
```

This is applied consistently across all three generation paths:

| Path | File | Fallback |
|---|---|---|
| Pipeline (GPT-OSS) | `generatePipeline()` | `selectedModelObj.maxNewTokens \|\| 2048` |
| VLM (Gemma4, etc.) | `generateVLM()` | `selectedModelObj.maxNewTokens \|\| 128` |
| Standard (Qwen, Llama, etc.) | `generate()` — KV cache path | `selectedModelObj.maxNewTokens \|\| undefined` |

When set to **default** (value `0`), the falsy `0` causes the `||` chain to fall through to the model's configured `maxNewTokens` from `constants.ts`.

### Max Input Tokens (≈ `-l`)

**onnxruntime-genai benchmark:**
The `-l` flag causes the benchmark to *generate* a synthetic prompt of exactly that token length by running the model from a seed token (`"A"`) and collecting tokens until the target count is reached.

**Our implementation:**
Since this is an interactive chat (not a benchmark), we don't generate synthetic prompts. Instead, `maxInputTokens` acts as a **truncation limit** on the tokenized conversation. After `tokenizer.apply_chat_template()` produces the input token sequence:

1. Check if the sequence length exceeds `maxInputTokens`
2. If so, keep only the **last N tokens** (most recent context) via tensor slicing:

```js
if (maxInputTokens && inputs.input_ids) {
  const seqLen = inputs.input_ids.dims?.[1] ?? inputs.input_ids.size;
  if (seqLen > maxInputTokens) {
    inputs.input_ids = inputs.input_ids.slice(null, [-maxInputTokens, null]);
    if (inputs.attention_mask) {
      inputs.attention_mask = inputs.attention_mask.slice(null, [-maxInputTokens, null]);
    }
  }
}
```

This keeps the most recent conversation context while enforcing a hard token budget — useful for testing how models perform with constrained context windows.

When set to **default** (value `0`), no truncation is applied.

## Data Flow

```
page.tsx (state: maxOutputTokens, maxInputTokens)
  │
  ├─► Sidebar (dropdown UI controls)
  │
  └─► ChatInterface
        │
        └─► workerRef.postMessage({ type: "generate", data: { ..., maxOutputTokens, maxInputTokens } })
              │
              └─► model-worker.js generate()
                    ├─► maxInputTokens → truncate input_ids tensor
                    └─► maxOutputTokens → override max_new_tokens param
```

## Files Changed

| File | Change |
|---|---|
| `app/[model]/[backend]/page.tsx` | Added `maxOutputTokens` / `maxInputTokens` state, passed to Sidebar and ChatInterface |
| `components/sidebar.tsx` | Added props + two `<select>` dropdowns in the Configuration section |
| `components/chat-interface.tsx` | Added props, forwarded values in the `postMessage` to the worker |
| `lib/model-worker.js` | All 3 generation paths accept and use the new parameters |

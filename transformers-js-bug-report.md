# `get_file_metadata` skips local file check when `env.localModelPath` is an HTTP URL (browser/worker environments)

## Description

When using `AutoProcessor.from_pretrained()` in a browser Web Worker with `env.localModelPath` set to an HTTP URL (e.g., `self.location.origin + '/models/'`), the tokenizer fails to load with:

```
TypeError: Cannot read properties of undefined (reading 'tokenizer_class')
```

This happens because `get_file_metadata` incorrectly skips the local file existence check, causing `get_tokenizer_files` to return `[]`, which makes `loadTokenizer` return an empty array. `AutoTokenizer.from_pretrained` then destructures `undefined` for `tokenizerConfig` and crashes accessing `.tokenizer_class`.

Models loaded via `getModelJSON` (config.json, etc.) work fine because `loadResourceFile` in `hub.js` uses the correct check.

## Reproduction

```js
// In a Web Worker
import { AutoProcessor, AutoModelForVision2Seq, env } from '@huggingface/transformers';

env.localModelPath = `${self.location.origin}/webnn-models/`;
env.allowLocalModels = true;
env.allowRemoteModels = false;

// ✅ This works (uses loadResourceFile → getModelJSON):
const model = await AutoModelForVision2Seq.from_pretrained(
  "onnx-community/Qwen3.5-0.8B-ONNX",
  { dtype: { embed_tokens: "q4", vision_encoder: "fp16", decoder_model_merged: "q4" }, device: "webgpu" }
);

// ❌ This fails (uses get_file_metadata → get_tokenizer_files → loadTokenizer):
const processor = await AutoProcessor.from_pretrained(
  "onnx-community/Qwen3.5-0.8B-ONNX"
);
// TypeError: Cannot read properties of undefined (reading 'tokenizer_class')
```

## Root Cause

In [`src/utils/model_registry/get_file_metadata.js`](https://github.com/huggingface/transformers.js/blob/main/src/utils/model_registry/get_file_metadata.js), the local file check tests whether `localPath` is a URL:

```js
// get_file_metadata.js — line ~77
if (env.allowLocalModels) {
    const isURL = isValidUrl(localPath, ['http:', 'https:']);  // ← BUG
    if (!isURL) {
        try {
            const response = await getFile(localPath);
            // ...
```

`localPath` is constructed by `buildResourcePaths` as `env.localModelPath + repo_id + filename`. When `env.localModelPath` is an HTTP URL (standard in browser/worker contexts, e.g., `https://localhost:3000/models/`), `localPath` becomes:

```
https://localhost:3000/models/onnx-community/Qwen3.5-0.8B-ONNX/tokenizer_config.json
```

This is a valid URL, so `isValidUrl(localPath, ...)` returns `true`, the `if (!isURL)` guard evaluates to `false`, and the local fetch is **skipped entirely**.

Meanwhile, `loadResourceFile` in [`src/utils/hub.js` (line ~275)](https://github.com/huggingface/transformers.js/blob/main/src/utils/hub.js) correctly checks `requestURL` (the **pre-prefix** path) instead:

```js
// hub.js — line ~275 (CORRECT)
if (env.allowLocalModels) {
    const isURL = isValidUrl(requestURL, ['http:', 'https:']);
    if (!isURL) {
        // ... fetch from localPath
```

`requestURL` is the `pathJoin(path_or_repo_id, filename)` result **before** `env.localModelPath` is prepended — e.g., `onnx-community/Qwen3.5-0.8B-ONNX/tokenizer_config.json`. This is never a URL when using a HuggingFace model ID, so the guard works as intended.

### Summary

| Function | Variable Checked | Value | `isValidUrl()` | Local fetch runs? |
|---|---|---|---|---|
| `loadResourceFile` (hub.js) ✅ | `requestURL` | `onnx-community/Qwen3.5-0.8B-ONNX/file.json` | `false` | **Yes** |
| `get_file_metadata` ❌ | `localPath` | `https://localhost:3000/models/onnx-community/Qwen3.5-0.8B-ONNX/file.json` | `true` | **No** |

## Proposed Fix

In `src/utils/model_registry/get_file_metadata.js`, check `requestURL` (the un-prefixed path) instead of `localPath`, matching the pattern used in `hub.js`:

```diff
--- a/src/utils/model_registry/get_file_metadata.js
+++ b/src/utils/model_registry/get_file_metadata.js
@@ -5,6 +5,7 @@
 import { env } from '../../env.js';
 import { getCache } from '../cache.js';
 import { buildResourcePaths, checkCachedResource, getFetchHeaders, getFile } from '../hub.js';
+import { pathJoin } from '../hub/utils.js';
 import { isValidUrl } from '../hub/utils.js';
 import { logger } from '../logger.js';
 
@@ -60,9 +61,10 @@ export async function get_file_metadata(path_or_repo_id, filename, options = {})
     }
 
+    const requestURL = pathJoin(path_or_repo_id, filename);
     // Check local file system
     if (env.allowLocalModels) {
-        const isURL = isValidUrl(localPath, ['http:', 'https:']);
+        const isURL = isValidUrl(requestURL, ['http:', 'https:']);
         if (!isURL) {
             try {
                 const response = await getFile(localPath);
```

The key insight: the `isURL` guard's purpose is to distinguish **"user passed a HuggingFace model ID"** (like `onnx-community/Qwen3.5-0.8B-ONNX`) from **"user passed a direct URL"**. Checking `localPath` (which has `env.localModelPath` prepended) defeats this purpose because `env.localModelPath` is commonly an HTTP URL in browser environments.

## Environment

- `@huggingface/transformers`: `4.0.0-next.5`
- Browser: Chromium-based (WebGPU-enabled)
- Context: Web Worker with `env.localModelPath` set to an HTTP origin URL
- Model: `onnx-community/Qwen3.5-0.8B-ONNX` (Qwen3.5 VLM, uses `AutoProcessor` → `Qwen3VLProcessor`)

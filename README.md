# WebGPU / WebNN Chat

Run large language models and vision-language models directly in the browser using **WebGPU** or **WebNN** hardware acceleration. Built with [Next.js](https://nextjs.org/), React, and [Transformers.js](https://huggingface.co/docs/transformers.js) — all inference happens on-device with zero data leaving the browser.

## Features

- **On-device inference** — no server, full privacy
- **Multiple backends** — WebGPU, WebNN GPU, WebNN NPU
- **15 models** — Gemma 3/4, Phi-3.5/4, Llama 3.2, Qwen3/3.5, DeepSeek R1, GPT-OSS, LFM2/2.5, SmolLM3
- **Vision-language models** — image input with Qwen3.5 and Gemma 4; video input with Qwen3.5
- **Thinking/reasoning** — models with thinking support display reasoning traces in a collapsible section
- **Real-time metrics** — TTFT, TPS, TPOT, throughput, decode time, E2E latency
- **Web Worker execution** — non-blocking inference on a background thread
- **Streaming output** — token-by-token generation with Harmony format support (GPT-OSS)

## Supported models

| Model | Producer | Type | Parameters | Size | Quantization | Features |
|-------|----------|------|-----------|------|-------------|----------|
| Gemma 3 | Google | SLM | 1B | 983 MB | q4f16 | — |
| Gemma 4 | Google | VLM | E2B | ~2 GB | q4f16 | Vision, thinking |
| Phi-3.5 Mini | Microsoft | SLM | 3.8B | 2.15 GB | q4f16 | — |
| Phi-4 Mini | Microsoft | SLM | 3.8B | 2.34 GB | q4f16 | — |
| Llama 3.2 | Meta | LLM | 1B / 3B | 1.01 / 2.29 GB | q4f16 | KV cache |
| Qwen3 | Alibaba | LLM | 0.6B / 4B | 543 MB / 2.63 GB | q4f16 | Thinking (0.6B) |
| Qwen3.5 | Alibaba | VLM | 0.8B / 4B | 814 MB / 3.52 GB | q4 | Vision, video, thinking |
| DeepSeek R1 Distill | DeepSeek | LLM | 1.5B | 1.27 GB | q4f16 | Thinking |
| GPT-OSS | OpenAI | MoE LLM | 20B | 11.8 GB | q4f16 | Thinking, Harmony streaming |
| LFM2 | Liquid AI | LLM | 1.2B | 1.13 GB | q4 | — |
| LFM2.5 | Liquid AI | LLM | 1.2B | 850 MB | q4 | Thinking |
| SmolLM3 | Hugging Face | LLM | 3B | 1.97 GB | q4f16 | — |

## Getting started

### Prerequisites

- Node.js 18+
- A browser with [WebGPU](https://caniuse.com/webgpu) or [WebNN](https://webmachinelearning.github.io/webnn-status/) support

### Install and run

```bash
npm install
npm run build
npm run dev
```

Open [https://localhost:3000](https://localhost:3000). The dev server uses HTTPS by default (required for WebGPU/WebNN APIs).

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (HTTPS, Turbopack) |
| `npm run build` | Bundle the model worker and build the app |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |

## Architecture

1. Select a model and backend (WebGPU / WebNN GPU / WebNN NPU) from the sidebar.
2. The model downloads from Hugging Face Hub (or loads from local cache).
3. Inference runs in a **Web Worker** via the ONNX runtime, keeping the UI thread free.
4. Tokens stream back to the chat interface in real time.

```
┌─────────────┐     postMessage      ┌──────────────────┐
│  React UI   │ ◄──────────────────► │  model-worker.js │
│  (main      │   load / generate /  │  (Web Worker)    │
│   thread)   │   interrupt          │                  │
└─────────────┘                      └────────┬─────────┘
                                              │
                                     ┌────────▼─────────┐
                                     │  Transformers.js  │
                                     │  + ONNX Runtime   │
                                     │  (WebGPU/WebNN)   │
                                     └──────────────────┘
```

### Generation paths

The model worker uses three generation paths depending on the model type:

| Path | Used by | Description |
|------|---------|-------------|
| `generatePipeline` | GPT-OSS | `pipeline("text-generation")` with Harmony stream parsing |
| `generateVLM` | Qwen3.5, Gemma 4 | `AutoProcessor` + `AutoModelForImageTextToText` for multimodal input |
| `generate` | All other models | `AutoTokenizer` + `AutoModelForCausalLM` for text-only inference |

## Performance indicators reference

Metrics are displayed as badges below each assistant message during and after generation.

### Per-request generation metrics

| Indicator | Full Name | Unit | Description | Formula |
|-----------|-----------|------|-------------|---------|
| **TTFT** | Time to First Token | ms | Time from request start to first output token. Covers the prefill phase (processing the entire input prompt). | $T_{\text{first\_token}} - T_{\text{request\_start}}$ |
| **TPS** | Tokens Per Second — Decode Throughput | tok/s | Token generation rate during the decode phase only, excluding TTFT. The first token is excluded from both count and time window. | $(N_{\text{tokens}} - 1) \;/\; (T_{\text{now}} - T_{\text{first\_token}}) \times 1000$ |
| **Decode Time** | Decode Latency | ms | Total time in the autoregressive decode phase, excluding the prefill phase. | $E2E - TTFT$ |
| **Throughput** | End-to-End Throughput | tok/s | Overall token generation rate including both prefill and decode. This is the standard industry definition (vLLM, TGI, llmperf). | $N_{\text{tokens}} \;/\; (E2E \;/\; 1000)$ |
| **TPOT** | Time Per Output Token — Inter-Token Latency (ITL) | ms | Average time per token after the first. Inverse of TPS: `TPOT = 1000 / TPS`. | $(E2E - TTFT) \;/\; (N_{\text{tokens}} - 1)$ |
| **E2E** | End-to-End Latency — Total Latency | ms | Wall-clock time from request start to final token. | $T_{\text{completion}} - T_{\text{request\_start}}$ |

### Model loading metric

| Indicator | Full Name | Unit | Description | Formula |
|-----------|-----------|------|-------------|---------|
| **Compilation Time** | Model Warm-up / Compile Time | ms | Time to warm up the model after loading weights, including a single-token inference to trigger JIT compilation. Measured once per model load. Displayed in the sidebar. | $T_{\text{end\_warmup}} - T_{\text{start\_warmup}}$ |

### Key relationships

| Relationship | Explanation |
|-------------|-------------|
| $TPOT = 1000 \;/\; TPS$ | TPOT and TPS are inverses (both measure decode-phase speed). |
| $E2E = TTFT + \text{Decode Time}$ | Total latency is prefill time plus decode time. |
| $\text{Decode Time} = TPOT \times (N - 1)$ | Decode time equals per-token latency times decoded token count. |
| $\text{Throughput} < TPS$ | E2E throughput is always lower than decode throughput because it includes TTFT. |

### Variable glossary

| Symbol | Meaning |
|--------|---------|
| $N_{\text{tokens}}$ | Total output tokens generated (including the first token) |
| $T_{\text{request\_start}}$ | Timestamp when generation begins (`performance.now()` at start) |
| $T_{\text{first\_token}}$ | Timestamp when the first output token is produced |
| $T_{\text{completion}}$ | Timestamp when the final output token is produced |

> **Note:** The `× 1000` factor in the TPS formula converts milliseconds (`performance.now()`) to seconds for the tok/s unit.

## Project structure

```
app/                  → Next.js app router pages
components/           → React components (chat UI, sidebar, media input)
lib/
  constants.ts        → Model and backend definitions
  model-worker.js     → Web Worker: model loading, generation, streaming
  harmony.js          → Harmony stream format parser (GPT-OSS)
  types.ts            → TypeScript type definitions
  utils.ts            → Shared utilities
public/
  model-worker.bundle.js  → Bundled worker (built by esbuild)
  webnn-models/            → Local ONNX model files (optional)
```

## License

This project is provided as-is for demonstration and research purposes.
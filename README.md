# WebGPU / WebNN Chat Demo

Run large language models and vision-language models directly in the browser using **WebGPU** or **WebNN** hardware acceleration. Built with Next.js, React, and [Transformers.js](https://huggingface.co/docs/transformers.js) — all inference happens on-device with full privacy.

## Features

- **On-device inference** — no server, no data leaves your browser
- **Multiple backends** — WebGPU, WebNN GPU, and WebNN NPU
- **13 models** including Gemma 3, Phi-4 Mini, Llama 3.2, Qwen3, DeepSeek R1, GPT-OSS 20B, LFM2, and SmolLM3
- **Vision-language support** — image and video input with Qwen3.5
- **Thinking/reasoning mode** — models with thinking tags display reasoning traces separately
- **Real-time performance metrics** — tokens/sec, time-to-first-token, inter-token latency
- **Web Worker inference** — non-blocking model execution on a background thread
- **Streaming output** — token-by-token generation with Harmony format support

## Supported Models

| Model | Parameters | Size | Notes |
|-------|-----------|------|-------|
| Gemma 3 | 1B | 983 MB | q4f16 |
| Phi-3.5 Mini | 3.8B | 2.15 GB | q4f16 |
| Phi-4 Mini | 3.8B | 2.34 GB | q4f16 |
| Llama 3.2 | 1B | 1.01 GB | q4f16, KV cache |
| Qwen3 | 0.6B / 4B | 543 MB / 2.63 GB | Thinking tags |
| Qwen3.5 (VLM) | 0.8B / 4B | — | Text, image, and video |
| DeepSeek R1 Distill | 1.5B | 1.27 GB | Thinking tags |
| GPT-OSS | 20B MoE | 11.8 GB | Harmony streaming |
| LFM2 / LFM2.5 | 1.2B | 1.13 GB / 850 MB | LFM2.5 supports thinking |
| SmolLM3 | 3B | 1.97 GB | q4f16 |

## Getting Started

### Prerequisites

- Node.js 18+
- A browser with [WebGPU](https://caniuse.com/webgpu) or [WebNN](https://webmachinelearning.github.io/webnn-status/) support

### Install & Run

```bash
npm install
npm run build
npm run dev
```

Open [https://localhost:3000](https://localhost:3000) in your browser. The dev server runs with HTTPS by default (required for WebGPU/WebNN).

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (HTTPS + Turbopack) |
| `npm run build` | Bundle the model worker and build the app |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |

## How It Works

1. Select a model and backend (WebGPU / WebNN GPU / WebNN NPU) from the sidebar
2. The model is downloaded from Hugging Face Hub (or loaded from a local cache)
3. Inference runs in a **Web Worker** using an ONNX runtime, keeping the UI responsive
4. Tokens stream back to the chat interface in real time
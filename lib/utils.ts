import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

let cachedHfDomain: string | null = null;

const JSDELIVR_NPM = "https://cdn.jsdelivr.net/npm/";
// npm version or dist-tag, e.g. "4.3.2", "1.31.0-dev.20260914-8d85527a0", "next".
const NPM_VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z.+_-]*$/;

function npmVersionOrWarn(param: string, value?: string | null): string | undefined {
  if (!value) return undefined;
  if (NPM_VERSION_RE.test(value)) return value;
  console.warn(`Ignoring invalid ?${param}= version: ${value.slice(0, 100)}`);
  return undefined;
}

/** ?transformers=<version> -> jsDelivr URL of the self-contained transformers.js ESM build. */
export function resolveTransformersUrl(version?: string | null): string | undefined {
  const v = npmVersionOrWarn("transformers", version);
  return v && `${JSDELIVR_NPM}@huggingface/transformers@${v}/dist/transformers.js`;
}

/** ?ort=<version> -> jsDelivr directory URL of onnxruntime-web's dist/ (WASM files). */
export function resolveOrtUrl(version?: string | null): string | undefined {
  const v = npmVersionOrWarn("ort", version);
  return v && `${JSDELIVR_NPM}onnxruntime-web@${v}/dist/`;
}

/** ?custom_ort=<url> -> normalized self-hosted onnxruntime-web dist/ URL (https, or http on loopback). */
export function parseCustomOrtUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
    if (url.protocol === "https:" || (url.protocol === "http:" && isLocal)) {
      return url.href.endsWith("/") ? url.href : `${url.href}/`;
    }
  } catch {
    // fall through
  }
  console.warn(`Ignoring invalid ?custom_ort= URL: ${value.slice(0, 200)}`);
  return undefined;
}

export const getHuggingFaceDomain = async () => {
    if (cachedHfDomain) {
        return cachedHfDomain;
    }

    const mainDomain = "huggingface.co";
    const mirrorDomain = "hf-mirror.com";
    const testPath = "/webml/models-moved/resolve/main/01.onnx";

    // Helper to test a specific domain with a timeout
    const checkDomain = async (domain: string) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

        try {
            const response = await fetch(`https://${domain}${testPath}`, {
                method: "HEAD", // Use HEAD to download headers only (lighter than GET)
                signal: controller.signal,
                cache: "no-store",
            });
            clearTimeout(timeoutId);
            return response.ok;
        } catch (error) {
            console.log(`Error reaching ${domain}:`, error);
            clearTimeout(timeoutId);
            return false;
        }
    };

    // 1. Try the main domain first
    const isMainReachable = await checkDomain(mainDomain);
    if (isMainReachable) {
        cachedHfDomain = mainDomain;
        return mainDomain;
    }

    // 2. If main fails, try the mirror
    const isMirrorReachable = await checkDomain(mirrorDomain);
    if (isMirrorReachable) {
        console.log(`Hugging Face main domain unreachable. Switching to mirror: ${mirrorDomain}`);
        cachedHfDomain = mirrorDomain;
        return mirrorDomain;
    }

    // 3. Default fallback
    cachedHfDomain = mainDomain;
    return mainDomain;
};

export function isRemoteEnvironment() {
  const hostname = typeof location !== "undefined" ? location.hostname : "";
  
  // Check if localhost
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return false;
  }
  
  // Check if intranet (private IP)
  if (/^10\./.test(hostname) || 
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) || 
      /^192\.168\./.test(hostname)) {
    return false;
  }

  if (hostname.endsWith('.local')) {
    return false;
  }
  
  // Check known remote domains
  if (hostname.endsWith("webai-playground.dev") ||
      hostname.endsWith("vercel.app") ||
      hostname.endsWith("github.io")) {
    return true;
  }
  
  // Default: if it has a domain name, likely remote
  return hostname.includes('.');
}

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

let cachedHfDomain: string | null = null;

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

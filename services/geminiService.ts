
import { Player, Strategy } from "../types";

const fetchGemini = async (action: string, payload: any) => {
  let res: Response;
  try {
    res = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload })
    });
  } catch (networkError) {
    console.error(`[geminiService] network error calling "${action}":`, networkError);
    throw networkError;
  }

  if (!res.ok) {
    if (res.status === 429) {
      throw new Error('AI Quota Exceeded. Please try again later.');
    }
    const body = await res.text().catch(() => '');
    const message = `AI request "${action}" failed (${res.status}): ${body || res.statusText}`;
    console.error(`[geminiService] ${message}`);
    throw new Error(message);
  }
  return res.json();
};

export const startChat = (systemInstruction: string = "You are a helpful assistant.") => {
  // Chat not fully ported to proxy, keeping stub
  return null;
};

// NOTE: These wrappers intentionally let errors propagate. Callers are
// responsible for catching and surfacing failures (loading state, toasts, etc.)
// so problems are visible rather than being silently swallowed as `null`.
export const analyzeRoster = async (roster: Player[]) => {
  return fetchGemini('analyzeRoster', { roster });
};

export const getAssistantGMSuggestion = async (players: Player[], budget: number, strategy: Strategy, currentLineup: Player[]) => {
  return fetchGemini('getAssistantGMSuggestion', { players, budget, strategy, currentLineup });
};

export const searchGroundingFast = async (query: string) => {
  return fetchGemini('searchGroundingFast', { query });
};

export const searchGroundingPro = async (query: string) => {
  return fetchGemini('searchGroundingPro', { query });
};

export const searchGrounding = async (query: string) => {
  return fetchGemini('searchGrounding', { query });
};

export const mapsGrounding = async (query: string, lat?: number, lng?: number) => {
  return fetchGemini('mapsGrounding', { query, lat, lng });
};

export const generateImagePro = async (prompt: string, imageSize: "1K" | "2K" | "4K") => {
  const res = await fetchGemini('generateImagePro', { prompt, imageSize });
  return res.image as string | null;
};

export const editImageWithFlash = async (base64Data: string, mimeType: string, prompt: string) => {
  const res = await fetchGemini('editImageWithFlash', { base64Data, mimeType, prompt });
  return res.image as string | null;
};

export const generateVeoVideo = async (imageBytes: string, mimeType: string, prompt: string, aspectRatio: '16:9' | '9:16') => {
  const res = await fetchGemini('generateVeoVideo', { imageBytes, mimeType, prompt, aspectRatio });
  return res.downloadLink as string | null; // Note: fetch blob proxying may be needed if cross-origin
};

// --- AUDIO HELPERS ---

export function encodeAudio(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function decodeAudio(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

export async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number) {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
  }
  return buffer;
}

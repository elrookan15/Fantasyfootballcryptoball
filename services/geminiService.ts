
import { Player, Strategy } from "../types";

const fetchGemini = async (action: string, payload: any) => {
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload })
  });
  if (!res.ok) {
    if (res.status === 429) {
      throw new Error('AI Quota Exceeded. Please try again later.');
    }
    throw new Error(await res.text());
  }
  return res.json();
};

export const startChat = (systemInstruction: string = "You are a helpful assistant.") => {
  // Chat not fully ported to proxy, keeping stub
  return null;
};

export const analyzeRoster = async (roster: Player[]) => {
  try {
    return await fetchGemini('analyzeRoster', { roster });
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const getAssistantGMSuggestion = async (players: Player[], budget: number, strategy: Strategy, currentLineup: Player[]) => {
  try {
    return await fetchGemini('getAssistantGMSuggestion', { players, budget, strategy, currentLineup });
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const searchGroundingFast = async (query: string) => {
  try {
    return await fetchGemini('searchGroundingFast', { query });
  } catch (err: any) {
    return { text: `Error: ${err.message}`, sources: [] };
  }
};

export const searchGroundingPro = async (query: string) => {
  try {
    return await fetchGemini('searchGroundingPro', { query });
  } catch (err: any) {
    return { text: `Error: ${err.message}`, sources: [] };
  }
};

export const searchGrounding = async (query: string) => {
  try {
    return await fetchGemini('searchGrounding', { query });
  } catch (err: any) {
    return { text: `Error: ${err.message}`, sources: [] };
  }
};

export const mapsGrounding = async (query: string, lat?: number, lng?: number) => {
  try {
    return await fetchGemini('mapsGrounding', { query, lat, lng });
  } catch (err: any) {
    return { text: `Error: ${err.message}`, sources: [] };
  }
};

export const generateImagePro = async (prompt: string, imageSize: "1K" | "2K" | "4K") => {
  try {
    const res = await fetchGemini('generateImagePro', { prompt, imageSize });
    return res.image;
  } catch (err) {
    return null;
  }
};

export const editImageWithFlash = async (base64Data: string, mimeType: string, prompt: string) => {
  try {
    const res = await fetchGemini('editImageWithFlash', { base64Data, mimeType, prompt });
    return res.image;
  } catch (err) {
    return null;
  }
};

export const generateVeoVideo = async (imageBytes: string, mimeType: string, prompt: string, aspectRatio: '16:9' | '9:16') => {
  try {
    const res = await fetchGemini('generateVeoVideo', { imageBytes, mimeType, prompt, aspectRatio });
    return res.downloadLink; // Note: fetch blob proxying may be needed if cross-origin
  } catch (err) {
    return null;
  }
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

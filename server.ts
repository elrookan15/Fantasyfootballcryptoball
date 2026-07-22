import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/gemini", async (req, res) => {
    try {
      const { action, payload } = req.body;
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
      if (!apiKey) {
        return res.status(500).json({ error: 'Missing Gemini API Key' });
      }
      
      const ai = new GoogleGenAI({ apiKey });

      if (action === 'searchGroundingFast') {
        const response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: payload.query,
          config: { tools: [{ googleSearch: {} }] },
        });
        return res.json({
          text: response.text,
          sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks
        });
      }
      
      if (action === 'searchGrounding') {
        const response = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: payload.query,
          config: { tools: [{ googleSearch: {} }] },
        });
        return res.json({
          text: response.text,
          sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks
        });
      }
      
      if (action === 'searchGroundingPro') {
        const response = await ai.models.generateContent({
          model: 'gemini-3.1-pro-preview',
          contents: payload.query,
          config: { 
            tools: [{ googleSearch: {} }]
          },
        });
        return res.json({
          text: response.text,
          sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks
        });
      }

      if (action === 'mapsGrounding') {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: payload.query,
          config: {
            tools: [{ googleMaps: {} }],
            toolConfig: {
              retrievalConfig: payload.lat && payload.lng ? { latLng: { latitude: payload.lat, longitude: payload.lng } } : undefined
            }
          }
        });
        return res.json({
          text: response.text,
          sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks
        });
      }
      
      if (action === 'analyzeRoster') {
        const prompt = `
          Persona: You are the RoundBlock AI Analyst, a highly intelligent fantasy football quant model.
          Context: Analyze the following user's drafted roster and provide projected performance metrics.
          
          Roster: ${JSON.stringify(payload.roster)}
          
          Instruction:
          1. Evaluate the synergistic strength of the roster (e.g. stacks, coverage, ceiling potential).
          2. Provide an overall rating out of 100.
          3. Calculate an estimated win probability percentage.
          4. Give a brief, sharp, 'cypherpunk/quant' style tactical summary (2-3 sentences max).
          5. Identify the "Key Asset" (the most important player) and a "Vulnerability" (weakest spot or biggest risk).
          
          Return JSON format only.
        `;
        const response = await ai.models.generateContent({
          model: 'gemini-3.1-pro-preview',
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }],
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                rating: { type: Type.NUMBER },
                winProbability: { type: Type.NUMBER },
                summary: { type: Type.STRING },
                keyAsset: { type: Type.STRING },
                vulnerability: { type: Type.STRING }
              },
              required: ["rating", "winProbability", "summary", "keyAsset", "vulnerability"]
            }
          }
        });
        return res.json(JSON.parse(response.text || '{}'));
      }
      
      if (action === 'getAssistantGMSuggestion') {
        const { players, budget, strategy, currentLineup } = payload;
        const prompt = `
          Persona: You are the RoundBlock AI Interface, a high-frequency fantasy sports quant.
          Context: High-stakes fantasy draft utilizing an Automated Market Maker (AMM) bonding curve for salaries.
          
          Current Draft Strategy Strategy: ${strategy.name}
          Strategy Goal: ${strategy.description}
          
          Budget Remaining: $${budget}
          Lineup Status: ${currentLineup.length}/8 slots filled.
          
          Current Lineup Composition: ${JSON.stringify(currentLineup)}
          
          Available Asset Pool (Top 10 by Projected Value): ${JSON.stringify(players.slice(0, 10))}
          
          Instruction: 
          1. Recommend exactly ONE player that best aligns with the "${strategy.name}" strategy.
          2. If Zero RB is active, avoid high-salary RBs early. 
          3. If Stack Attack is active, prioritize receivers matching the QB's team if a QB is already drafted.
          4. Consider the AMM salary impact—if a player is too expensive (chalk), recommend a high-value alternative if it fits the strategy.
          
          Return JSON format only.
        `;
        const response = await ai.models.generateContent({
          model: 'gemini-3.1-pro-preview',
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }],
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                recommendedPlayerId: { type: Type.STRING },
                playerName: { type: Type.STRING },
                confidence: { type: Type.NUMBER },
                reasoning: { type: Type.STRING },
                alignment: { type: Type.STRING }
              },
              required: ["recommendedPlayerId", "playerName", "confidence", "reasoning", "alignment"]
            }
          }
        });
        return res.json(JSON.parse(response.text || '{}'));
      }
      
      if (action === 'generateImagePro') {
        const response = await ai.models.generateContent({
          model: 'gemini-3-pro-image-preview',
          contents: { parts: [{ text: payload.prompt }] },
          config: { imageConfig: { aspectRatio: "1:1", imageSize: payload.imageSize } },
        });
        for (const part of response.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData) return res.json({ image: `data:image/png;base64,${part.inlineData.data}` });
        }
        return res.json({ image: null });
      }
      
      if (action === 'editImageWithFlash') {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: {
            parts: [
              { inlineData: { data: payload.base64Data, mimeType: payload.mimeType } },
              { text: payload.prompt }
            ]
          },
        });
        for (const part of response.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData) return res.json({ image: `data:image/png;base64,${part.inlineData.data}` });
        }
        return res.json({ image: null });
      }
      
      if (action === 'generateVeoVideo') {
        let operation = await ai.models.generateVideos({
          model: 'veo-3.1-fast-generate-preview',
          prompt: payload.prompt || 'Animate this sports asset',
          image: { imageBytes: payload.imageBytes, mimeType: payload.mimeType },
          config: { numberOfVideos: 1, resolution: '720p', aspectRatio: payload.aspectRatio }
        });
        while (!operation.done) {
          await new Promise(resolve => setTimeout(resolve, 10000));
          operation = await ai.operations.getVideosOperation({ operation: operation });
        }
        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        return res.json({ downloadLink });
      }
      
      return res.status(400).json({ error: 'Unknown action' });
      
    } catch (error: any) {
      const errorMsg = error?.message || JSON.stringify(error) || '';
      const isQuotaError = errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED') || error?.status === 429;
      if (isQuotaError) {
        console.warn('AI Quota Exceeded (429). Returning 429 to client.');
        return res.status(429).json({ error: 'AI Quota Exceeded. Please try again later.' });
      }
      console.error(error);
      return res.status(500).json({ error: error.message || 'Internal server error' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

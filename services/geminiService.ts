import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

// NOTE: In a real environment, you should proxy this through a backend.
// For this standalone app simulation, we rely on process.env.API_KEY.
// The user interface for API Key input is removed as per guidelines.

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key not found in environment variables (process.env.API_KEY).");
  }
  return new GoogleGenAI({ apiKey });
};

export const listModels = async () => {
    // Note: The @google/genai SDK v1beta doesn't expose a direct `listModels` 
    // in the same way the REST API does easily without specific auth scopes sometimes.
    // We will return a static list of recommended models to ensure stability 
    // and avoid complex auth setup for list operations.
    return [
        "gemini-2.0-flash-exp",
        "gemini-2.0-flash",
        "gemini-1.5-pro",
        "gemini-1.5-flash"
    ];
};

export const generateContent = async (
  model: string,
  prompt: string,
  systemInstruction?: string,
  isJson?: boolean
): Promise<string> => {
  const ai = getClient();
  
  const config: any = {
    temperature: 0.2,
    maxOutputTokens: 2048,
  };
  
  if (isJson) {
      config.responseMimeType = "application/json";
  }
  if (systemInstruction) {
    config.systemInstruction = systemInstruction;
  }

  const response = await ai.models.generateContent({
    model: model,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: config
  });

  return response.text || "";
};

export const generateContentStream = async function* (
  model: string,
  history: { role: 'user' | 'model'; text: string }[],
  newMessage: string,
  systemInstruction?: string
) {
  const ai = getClient();

  // Convert history to SDK format
  const contents = history.map(h => ({
    role: h.role,
    parts: [{ text: h.text }]
  }));
  // Add new message
  contents.push({ role: 'user', parts: [{ text: newMessage }] });

  const responseStream = await ai.models.generateContentStream({
    model: model,
    contents: contents,
    config: {
      systemInstruction: systemInstruction,
    }
  });

  for await (const chunk of responseStream) {
     yield chunk.text;
  }
};


import { GoogleGenAI, Type } from "@google/genai";
import { CodeAnalysis } from "../types";

const SYSTEM_INSTRUCTION = `You are a world-class Senior Software Engineer and Security Auditor. 
Your task is to analyze the provided code for:
1. Logic bugs and edge cases.
2. Performance bottlenecks.
3. Security vulnerabilities (SQLi, XSS, etc.).
4. Refactoring opportunities based on modern Clean Code principles.
5. Provide a refactored version of the code if applicable.

Return the response in strictly JSON format.`;

export const analyzeCode = async (code: string): Promise<CodeAnalysis> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `Analyze this code:\n\n${code}`,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING, description: "A brief high-level summary of what the code does." },
          bugs: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING },
            description: "A list of identified bugs or logical errors."
          },
          optimizations: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING },
            description: "Suggested performance or readability optimizations."
          },
          securityConcerns: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING },
            description: "Potential security flaws."
          },
          refactoredCode: { 
            type: Type.STRING, 
            description: "A complete refactored version of the input code." 
          }
        },
        required: ["summary", "bugs", "optimizations", "securityConcerns"]
      }
    }
  });

  try {
    return JSON.parse(response.text || '{}') as CodeAnalysis;
  } catch (error) {
    console.error("Failed to parse Gemini response", error);
    throw new Error("Failed to analyze code. The AI response was malformed.");
  }
};

export const getChatResponse = async (history: { role: string, content: string }[], userMessage: string, codeContext: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const chat = ai.chats.create({
    model: 'gemini-3-flash-preview',
    config: {
      systemInstruction: `You are a helpful coding assistant. You are discussing this specific code snippet with the user:\n\n${codeContext}`
    }
  });

  // Since chat.sendMessage only takes 'message', we format our context
  const response = await chat.sendMessage({ message: userMessage });
  return response.text;
};

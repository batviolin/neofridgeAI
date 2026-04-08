import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { FridgeState } from "../types";

// Use the platform's API key. Fallback to the user's provided key if needed, 
// but system instructions prefer process.env.GEMINI_API_KEY.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyATFNFd7Y_SjGo0em_fKO2CmDYecWgeeak";

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const changeTemperature: FunctionDeclaration = {
  name: "changeTemperature",
  description: "Changes the refrigerator temperature. Use delta to increase or decrease, or set a specific value.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      delta: {
        type: Type.NUMBER,
        description: "The amount to change the temperature by (e.g., +1 or -1).",
      },
      absolute: {
        type: Type.NUMBER,
        description: "A specific temperature to set (e.g., 4).",
      },
    },
  },
};

const updateInventory: FunctionDeclaration = {
  name: "updateInventory",
  description: "Adds, removes, or updates items in the fridge inventory.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      action: {
        type: Type.STRING,
        enum: ["add", "remove", "update"],
        description: "The action to perform on the inventory.",
      },
      itemName: {
        type: Type.STRING,
        description: "The name of the item (e.g., 'milk', 'eggs').",
      },
      qty: {
        type: Type.NUMBER,
        description: "The quantity or delta to add/remove.",
      },
    },
    required: ["action", "itemName"],
  },
};

export async function processVoiceCommand(
  transcript: string,
  state: FridgeState
) {
  const systemInstruction = `
    You are NeoFridge, a smart AI assistant for a refrigerator. 
    Current State:
    - Temperature: ${state.temperature}°C
    - Inventory: ${JSON.stringify(state.inventory)}

    You can control the temperature and manage inventory using the provided tools.
    You can also tell jokes, suggest recipes based on what's inside, and answer general questions.
    If a user asks for a recipe, prioritize items already in the inventory.
    If they ask to add/remove items or change temp, use the tools.
    Always respond with a friendly, helpful voice.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: transcript,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: [changeTemperature, updateInventory] }],
      },
    });

    return {
      text: response.text,
      functionCalls: response.functionCalls,
    };
  } catch (error) {
    console.error("Gemini API Error:", error);
    return {
      text: "I'm sorry, I'm having trouble connecting to my brain right now.",
      functionCalls: null,
    };
  }
}

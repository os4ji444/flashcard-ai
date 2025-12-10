
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { AIConfig } from "../types";

const getClient = () => {
    // This allows the client to pick up the API key if it was updated in the environment/session
    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("API Key not found in environment variables");
    return new GoogleGenAI({ apiKey });
};

// Define the schema for the flashcard response
const flashcardSchema: Schema = {
    type: Type.OBJECT,
    properties: {
        name: {
            type: Type.STRING,
            description: "The exact name of the object/instrument in the image.",
        },
        description: {
            type: Type.STRING,
            description: "A concise description (1-2 sentences) of its function or use.",
        },
        isValid: {
            type: Type.BOOLEAN,
            description: "Set to TRUE if the image shows a distinct object, instrument, or diagram. Set to FALSE if the image is just text, a solid color, a logo, or unidentifiable.",
        }
    },
    required: ["name", "description", "isValid"],
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to reliably extract JSON from LLM text response
const extractJson = (text: string) => {
    try {
        // 1. Try direct parse
        return JSON.parse(text);
    } catch (e) {
        // 2. Try markdown extraction
        const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (match) {
            try { return JSON.parse(match[1]); } catch (e2) { /* ignore */ }
        }
        // 3. Try finding brackets
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start !== -1 && end !== -1) {
            try { return JSON.parse(text.substring(start, end + 1)); } catch (e3) { /* ignore */ }
        }
        return null;
    }
};

const generateOpenAIContent = async (base64Image: string, contextText: string, language: string, config: AIConfig) => {
    const prompt = `
    You are an expert medical and scientific tutor.
    
    TASK: Create a flashcard for the medical instrument or object shown in the image.
    
    CONTEXT PROVIDED FROM DOCUMENT: 
    ${contextText.substring(0, 1000)}...

    TARGET LANGUAGE: "${language}"

    OUTPUT FORMAT: JSON ONLY.
    Structure:
    {
      "name": "Name of instrument in ${language}",
      "description": "Brief description in ${language}",
      "isValid": boolean (true if valid medical/scientific image, false if text/logo/garbage)
    }
    `;

    try {
        const response = await fetch(`${config.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`
            },
            body: JSON.stringify({
                model: config.modelName,
                messages: [
                    {
                        role: "system",
                        content: "You are a helpful assistant that outputs JSON."
                    },
                    {
                        role: "user",
                        content: [
                            { type: "text", text: prompt },
                            { type: "image_url", image_url: { url: base64Image } }
                        ]
                    }
                ],
                // Attempt to force JSON mode if supported (works on GPT-4o, etc)
                response_format: { type: "json_object" }
            })
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`External API Error: ${response.status} - ${err}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        
        if (!content) throw new Error("No content received from External API");

        const json = extractJson(content);
        if (!json) throw new Error("Failed to parse JSON from External API response");

        return json;

    } catch (error: any) {
        console.error("External API Error:", error);
        // Fallback error object if parsing failed but we handled the exception
        if (error.message.includes("JSON")) {
             return { name: "Error", description: "Invalid JSON response from model", isValid: true };
        }
        throw error;
    }
};

export const generateFlashcardContent = async (base64Image: string, contextText: string = '', language: string = 'French', aiConfig: AIConfig): Promise<{ name: string; description: string; isValid?: boolean }> => {
    
    // --- External / OpenAI Compatible Provider ---
    if (aiConfig.provider === 'openai') {
        try {
            return await generateOpenAIContent(base64Image, contextText, language, aiConfig);
        } catch (error: any) {
            return {
                name: "Error",
                description: `External API Error: ${error.message}`,
                isValid: true
            };
        }
    }

    // --- Google Gemini Provider ---
    const ai = getClient();
    const cleanBase64 = base64Image.split(',')[1]; // Remove data:image/png;base64, prefix for Google SDK
    
    const MAX_RETRIES = 3;
    let attempt = 0;

    while (attempt <= MAX_RETRIES) {
        try {
            const response = await ai.models.generateContent({
                model: aiConfig.modelName || 'gemini-2.5-flash',
                contents: {
                    parts: [
                        {
                            inlineData: {
                                mimeType: 'image/png', 
                                data: cleanBase64
                            }
                        },
                        {
                            text: `You are an expert medical and scientific tutor.
                            
                            **TASK**: Create a flashcard for the medical instrument or object shown in the image.
                            
                            **CONTEXT PROVIDED**: 
                            ${contextText}
                            
                            **TARGET LANGUAGE**: "${language}"
                            
                            **INSTRUCTIONS**:
                            1. **Analyze Context**: The context contains text from the PREVIOUS, CURRENT, and NEXT slides.
                               - Search the provided text for instrument names that match the visual appearance of the image.
                            
                            2. **Validate**: Is this a valid flashcard image? 
                               - VALID: Medical instruments, scientific devices, anatomical diagrams.
                               - INVALID: Text screenshots, logos, solid colors, decorative elements.
                               - If INVALID, set "isValid" to false.
                            
                            3. **Identify & Translate**: 
                               - Name the object precisely based on the context text.
                               - Output 'name' and 'description' in ${language}.
                            
                            4. **Describe**: Provide a brief educational description in ${language}.`
                        }
                    ]
                },
                config: {
                    responseMimeType: "application/json",
                    responseSchema: flashcardSchema,
                }
            });

            const text = response.text;
            if (!text) throw new Error("No response from Gemini");
            
            return JSON.parse(text);

        } catch (error: any) {
            console.warn(`Gemini API Attempt ${attempt + 1} failed:`, error.message);
            
            const isQuotaError = error.message.includes('429') || 
                                 error.message.includes('quota') || 
                                 error.message.includes('exhausted') ||
                                 error.message.includes('503');

            if (isQuotaError && attempt < MAX_RETRIES) {
                const delay = Math.pow(2, attempt + 1) * 1000;
                await sleep(delay);
                attempt++;
                continue;
            }

            if (attempt === MAX_RETRIES || !isQuotaError) {
                return {
                    name: "Error",
                    description: isQuotaError 
                        ? "Quota limit reached. Please retry later or use a paid API key." 
                        : "Could not identify the object.",
                    isValid: true 
                };
            }
        }
    }

    return { name: "Error", description: "Unknown error", isValid: true };
};

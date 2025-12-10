
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
        // 1. Clean markdown code blocks if present
        let cleanText = text.replace(/```json\s*|\s*```/g, '');
        
        // 2. Try direct parse
        return JSON.parse(cleanText);
    } catch (e) {
        // 3. Try finding the first '{' and last '}'
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start !== -1 && end !== -1) {
            try { return JSON.parse(text.substring(start, end + 1)); } catch (e3) { /* ignore */ }
        }
        return null;
    }
};

const PROXY_URL = "https://corsproxy.io/?";

const generateOpenAIContent = async (base64Image: string, contextText: string, language: string, config: AIConfig) => {
    // Sanitize Base URL
    let baseUrl = config.baseUrl.trim();
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
    
    // Construct Endpoint
    let endpoint = `${baseUrl}/chat/completions`;
    
    // Apply Proxy if enabled
    if (config.useProxy) {
        endpoint = PROXY_URL + encodeURIComponent(endpoint);
    }

    const systemPrompt = "You are a helpful assistant that outputs JSON.";
    
    const performFetch = async (useImage: boolean) => {
        let userContent: any;
        let prompt = "";

        if (useImage) {
            prompt = `
            You are an expert medical and scientific tutor.
            TASK: Create a flashcard for the medical instrument or object shown in the image.
            
            CONTEXT FROM DOCUMENT: 
            ${contextText.substring(0, 1000)}...

            TARGET LANGUAGE: "${language}"

            OUTPUT: JSON with keys: name, description, isValid (boolean).
            `;
            
            userContent = [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: base64Image } }
            ];
        } else {
            // Text-Only Fallback Prompt
            prompt = `
            You are an expert medical and scientific tutor.
            
            The user uploaded a document image, but I cannot send it to you.
            Infer the content of the "current slide" based on this text context:
            
            ${contextText.substring(0, 1500)}...

            TASK: Identify the most likely medical instrument described in the middle of this context.
            TARGET LANGUAGE: "${language}"

            OUTPUT: JSON with keys: name, description, isValid (boolean).
            `;
            
            userContent = prompt; 
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`
            },
            body: JSON.stringify({
                model: config.modelName,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userContent }
                ],
                temperature: 0.3,
                max_tokens: 500
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`API Error ${response.status}: ${errText}`);
        }

        return await response.json();
    };

    try {
        // Attempt 1: Try with Image (Multimodal)
        // DeepSeek-Chat does not support images, so this will likely fail with 400.
        const data = await performFetch(true);
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error("No content received");
        const json = extractJson(content);
        if (!json) throw new Error("Failed to parse JSON");
        return json;

    } catch (error: any) {
        const errString = error.toString().toLowerCase();
        
        // CRITICAL: If Auth error, do NOT retry.
        if (errString.includes('401') || errString.includes('unauthorized')) {
            throw new Error("Invalid API Key (401). Please check your settings.");
        }

        // If it's a CORS error (Failed to fetch) and proxy is NOT enabled, hint the user
        if (errString.includes('failed to fetch') && !config.useProxy) {
            throw new Error("Network Error (CORS). Enable 'CORS Proxy' in Settings to fix this.");
        }

        // For any other error (400 Bad Request, 422, Network Error w/ Proxy), try Text Fallback
        console.warn(`Multimodal request failed (${error.message}). Retrying with text-only context...`);
        
        try {
            // Attempt 2: Text Only
            const data = await performFetch(false);
            const content = data.choices?.[0]?.message?.content;
            if (!content) throw new Error("No content received in fallback");
            const json = extractJson(content);
            if (!json) throw new Error("Failed to parse JSON in fallback");
            return json;
        } catch (fallbackError: any) {
            console.error("Fallback failed:", fallbackError);
            
            let finalMsg = error.message;
            if (fallbackError.message.includes('failed to fetch') && !config.useProxy) {
                finalMsg = "Network Error (CORS). Enable 'CORS Proxy' in Settings.";
            } else {
                finalMsg = `${error.message} (Fallback: ${fallbackError.message})`;
            }
            
            throw new Error(finalMsg);
        }
    }
};

export const testConnection = async (config: AIConfig): Promise<{ success: boolean; message: string }> => {
    try {
        if (config.provider === 'google') {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
            // Simple model list or dummy generation to test
            const model = ai.getGenerativeModel({ model: "gemini-2.5-flash" });
            await model.generateContent("Test");
            return { success: true, message: "Google Gemini connection successful!" };
        } else {
            // External
            let baseUrl = config.baseUrl.trim();
            if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
            let endpoint = `${baseUrl}/chat/completions`;
            if (config.useProxy) {
                endpoint = PROXY_URL + encodeURIComponent(endpoint);
            }

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.apiKey}`
                },
                body: JSON.stringify({
                    model: config.modelName,
                    messages: [{ role: "user", content: "Ping" }],
                    max_tokens: 5
                })
            });
            
            if (!response.ok) {
                const txt = await response.text();
                throw new Error(`Status ${response.status}: ${txt}`);
            }
            return { success: true, message: "External API connection successful!" };
        }
    } catch (e: any) {
        return { success: false, message: e.message || "Connection failed" };
    }
};

export const generateFlashcardContent = async (base64Image: string, contextText: string = '', language: string = 'French', aiConfig: AIConfig): Promise<{ name: string; description: string; isValid?: boolean }> => {
    
    // --- External / OpenAI Compatible Provider ---
    if (aiConfig.provider === 'openai') {
        try {
            const result = await generateOpenAIContent(base64Image, contextText, language, aiConfig);
            // Normalize result
            return {
                name: result.name || "Unknown",
                description: result.description || "No description provided",
                isValid: result.isValid !== undefined ? result.isValid : true
            };
        } catch (error: any) {
            return {
                name: "Error",
                description: error.message,
                isValid: true // Keep it as an error card so user can see the message
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

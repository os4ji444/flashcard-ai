
import { GoogleGenAI, Type, Schema } from "@google/genai";

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

export const generateFlashcardContent = async (base64Image: string, contextText: string = '', language: string = 'French'): Promise<{ name: string; description: string; isValid?: boolean }> => {
    const ai = getClient();
    const cleanBase64 = base64Image.split(',')[1];
    
    // Retry configuration
    const MAX_RETRIES = 3;
    let attempt = 0;

    while (attempt <= MAX_RETRIES) {
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
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
            
            // Check for Quota/Rate Limit errors (429) or Service Unavailable (503)
            const isQuotaError = error.message.includes('429') || 
                                 error.message.includes('quota') || 
                                 error.message.includes('exhausted') ||
                                 error.message.includes('503');

            if (isQuotaError && attempt < MAX_RETRIES) {
                // Exponential Backoff: 2s, 4s, 8s
                const delay = Math.pow(2, attempt + 1) * 1000;
                console.log(`Retrying in ${delay}ms...`);
                await sleep(delay);
                attempt++;
                continue;
            }

            // If we ran out of retries or it's a different error
            if (attempt === MAX_RETRIES || !isQuotaError) {
                return {
                    name: "Error",
                    description: isQuotaError 
                        ? "Quota limit reached. Please retry later or use a paid API key." 
                        : "Could not identify the object.",
                    isValid: true // Keep it valid so the user sees the error and can retry
                };
            }
        }
    }

    return { name: "Error", description: "Unknown error", isValid: true };
};

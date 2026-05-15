import { YoutubeTranscript } from "youtube-transcript";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
});

const level = "A1.1";

async function generateCards(videoId) {
    try {
        const transcript = await YoutubeTranscript.fetchTranscript(videoId);
        const transcriptText = transcript.map((entry) => entry.text).join(" ");

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-lite",
            contents: `Generate flashcards for learning German for ${level} and  ${transcriptText}`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            german: { type: "string" },
                            english: { type: "string" }
                        },
                        required: ["german", "english"]
                    }
                }
            }
        });

        const cards = JSON.parse(response.text);
        console.log(`Got ${cards.length} cards:`);
        console.log(cards);
    } catch (error) {
        console.error("Error generating cards:", error);
    }
}

// Example usage with a YouTube video ID
generateCards("dC6ZGLzdaTs");
import { YoutubeTranscript } from "youtube-transcript";
import { GoogleGenAI } from "@google/genai";
import prisma from "../prisma/db.js";

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

        const video = await prisma.video.findUnique({
            where: { youtubeId: videoId }
        });
        if (!video) {
            console.error(`Video with ID ${videoId} not found in the database.`);
            return;
        }

        // Wipe existing cards for this video so re-runs don't pile up duplicates
        await prisma.card.deleteMany({
            where: { videoId: video.id }
        });

        // Insert fresh cards — add level + videoId on top of Gemini's { german, english }
        const result = await prisma.card.createMany({
            data: cards.map(c => ({
                level: video.level,
                german: c.german,
                english: c.english,
                videoId: video.id
            }))
        });

        console.log(`Saved ${result.count} cards for "${video.title}"`);
    } catch (error) {
        console.error("Error generating cards:", error);
    } finally {
        await prisma.$disconnect();
    }
}

            // Example usage with a YouTube video ID
            generateCards("dC6ZGLzdaTs");
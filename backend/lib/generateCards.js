import { YoutubeTranscript } from "youtube-transcript";
import { GoogleGenAI } from "@google/genai";
import prisma from "../prisma/db.js";

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
});

// Generate + save flashcards for a single seeded video
async function generateCardsForVideo(video) {
    // Fetch the transcript
    const transcript = await YoutubeTranscript.fetchTranscript(video.youtubeId);
    const transcriptText = transcript.map((entry) => entry.text).join(" ");

    // Ask Gemini for sentence-level flashcards at the right level
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-lite",
        contents: `Generate German flashcards for CEFR level ${video.level}. Source transcript: """${transcriptText}"""`,
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

    // Wipe old cards for this video so re-runs don't pile up duplicates
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

    console.log(`Saved ${result.count} cards for [${video.level}] "${video.title}"`);
}

// Loop through every seeded video — one at a time so we don't hammer Gemini's rate limit.
// Pass a YouTube ID as a CLI arg to run for just that one video, e.g.:
//   node --env-file=.env lib/generateCards.js 0bm1BKmChro
async function main() {
    const filterId = process.argv[2];
    const videos = filterId
        ? await prisma.video.findMany({ where: { youtubeId: filterId } })
        : await prisma.video.findMany();

    console.log(`Generating cards for ${videos.length} videos...\n`);

    for (const video of videos) {
        try {
            await generateCardsForVideo(video);
        } catch (error) {
            console.error(`Failed for [${video.level}] "${video.title}":`, error.message);
        }
    }

    console.log('\nAll done.');
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });

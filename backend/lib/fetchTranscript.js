import { YoutubeTranscript } from 'youtube-transcript';

async function main() {
    const videoId = "dC6ZGLzdaTs";
    try {
        const transcript = await YoutubeTranscript.fetchTranscript(videoId);
        console.log(transcript);
    } catch (error) {
        console.error("Error fetching transcript:", error);
    }
}

main();
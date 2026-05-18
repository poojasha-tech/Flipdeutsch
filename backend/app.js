import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import prisma from './prisma/db.js';
import { GoogleGenAI } from '@google/genai';
import { YoutubeTranscript } from 'youtube-transcript';

// ES modules don't have __dirname — derive it from import.meta.url
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());          // POST/PUT bodies arrive as req.body

// Serve the static frontend from /frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// ============================================================
// Helpers
// ============================================================

// Extract the 11-char YouTube ID from any standard URL shape, or pass it through if already an ID.
function extractYoutubeId(input) {
  const s = (input || '').trim();
  const patterns = [
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = s.match(p);
    if (m) return m[1];
  }
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  return null;
}

// Run the offline pipeline live for a single video: find-or-create Video row,
// fetch transcript, ask Gemini, wipe + save cards, return the saved cards.
async function generateForVideo(youtubeId, level) {
  let video = await prisma.video.findUnique({ where: { youtubeId } });
  if (!video) {
    video = await prisma.video.create({
      data: { youtubeId, level, title: `User-submitted video (${youtubeId})` }
    });
  }

  const transcript = await YoutubeTranscript.fetchTranscript(youtubeId);
  const transcriptText = transcript.map(e => e.text).join(' ');

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: `Generate German flashcards for CEFR level ${video.level}. Source transcript: """${transcriptText}"""`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            german: { type: 'string' },
            english: { type: 'string' }
          },
          required: ['german', 'english']
        }
      }
    }
  });

  const cards = JSON.parse(response.text);

  await prisma.card.deleteMany({ where: { videoId: video.id } });
  await prisma.card.createMany({
    data: cards.map(c => ({
      level: video.level,
      german: c.german,
      english: c.english,
      videoId: video.id
    }))
  });

  // Return the saved cards (with video info, like /api/cards)
  return prisma.card.findMany({
    where: { videoId: video.id },
    include: { video: { select: { youtubeId: true, title: true } } }
  });
}

// ============================================================
// Read endpoints
// ============================================================

app.get('/api/cards', async (req, res) => {
  const { level } = req.query;
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);
  if (!level) return res.status(400).json({ error: 'level query parameter is required' });

  const all = await prisma.card.findMany({
    where: { level },
    include: { video: { select: { youtubeId: true, title: true } } }
  });
  const shuffled = all.sort(() => Math.random() - 0.5).slice(0, limit);
  res.json(shuffled);
});

app.get('/api/stats', async (req, res) => {
  const counts = await prisma.card.groupBy({
    by: ['level'],
    _count: true
  });
  res.json(counts.map(c => ({ level: c.level, total: c._count })));
});

// ============================================================
// Live AI endpoints
// ============================================================

// POST /api/generate { youtubeUrl, level } → generates cards from any YouTube URL
app.post('/api/generate', async (req, res) => {
  const { youtubeUrl, level } = req.body;
  const youtubeId = extractYoutubeId(youtubeUrl);
  if (!youtubeId) return res.status(400).json({ error: 'Could not parse a YouTube ID from that URL.' });
  if (!level) return res.status(400).json({ error: 'level is required' });

  try {
    const cards = await generateForVideo(youtubeId, level);
    res.json(cards);
  } catch (e) {
    console.error('generate failed:', e.message);
    res.status(500).json({ error: `Generation failed: ${e.message}` });
  }
});

// POST /api/explain { word, sentence } → Gemini explains a German word in context
app.post('/api/explain', async (req, res) => {
  const { word, sentence } = req.body;
  if (!word) return res.status(400).json({ error: 'word is required' });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Explain the German word "${word}" as used in this sentence: "${sentence || ''}".
Cover: meaning, part of speech (with gender for nouns / conjugation hint for verbs / case for prepositions), and any usage notes.
Reply in plain English (NO markdown, no asterisks, no bullet symbols), under 80 words. Be concise — this is a flashcard helper, not a textbook.`
    });
    res.json({ explanation: response.text });
  } catch (e) {
    console.error('explain failed:', e.message);
    const friendly = parseGeminiError(e);
    res.status(friendly.status).json({ error: friendly.message });
  }
});

// POST /api/grade { german, userTranslation } → Gemini grades the user's English translation
app.post('/api/grade', async (req, res) => {
  const { german, userTranslation } = req.body;
  if (!german || !userTranslation) return res.status(400).json({ error: 'german and userTranslation are required' });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `A learner saw this German text: "${german}"
They typed this English translation: "${userTranslation}"

Grade the translation. Be encouraging but honest. If it's close enough in meaning, count it as correct. Reply in JSON.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            correct: { type: 'boolean' },
            feedback: { type: 'string' },
            betterTranslation: { type: 'string' }
          },
          required: ['correct', 'feedback', 'betterTranslation']
        }
      }
    });
    res.json(JSON.parse(response.text));
  } catch (e) {
    console.error('grade failed:', e.message);
    const friendly = parseGeminiError(e);
    res.status(friendly.status).json({ error: friendly.message });
  }
});

// Translate Gemini errors into something a human can act on.
function parseGeminiError(e) {
  const msg = e?.message || '';
  // Gemini's JS SDK puts a JSON payload inside e.message for some errors
  try {
    const parsed = JSON.parse(msg);
    const code = parsed?.error?.code;
    const retry = parsed?.error?.details?.find(d => d['@type']?.includes('RetryInfo'))?.retryDelay;
    if (code === 429) {
      return {
        status: 429,
        message: `Gemini free-tier quota exhausted${retry ? ` — retry in ${retry}` : ''}. Try a different model or wait until tomorrow.`
      };
    }
    if (code === 503) {
      return { status: 503, message: 'Gemini is busy — try again in a moment.' };
    }
    return { status: 500, message: parsed?.error?.message || 'Gemini error.' };
  } catch {
    return { status: 500, message: msg || 'Unknown error.' };
  }
}

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

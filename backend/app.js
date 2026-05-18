import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import prisma from './prisma/db.js';

// ES modules don't have __dirname — derive it from import.meta.url
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Serve the static frontend (index.html, styles.css, app.js) from /frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// GET /api/cards?level=A1.1 → returns up to 10 random cards for that level
app.get('/api/cards', async (req, res) => {
  const { level } = req.query;
  if (!level) {
    return res.status(400).json({ error: 'level query parameter is required' });
  }

  // Fetch all matching cards, shuffle in JS, take first 10.
  // Simpler than raw SQL ORDER BY RANDOM(), and the per-level pool is small.
  const all = await prisma.card.findMany({ where: { level } });
  const shuffled = all.sort(() => Math.random() - 0.5).slice(0, 10);

  res.json(shuffled);
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

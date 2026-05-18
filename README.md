# Flipdeutsch

> Learn German by flipping AI-generated flashcards. Built from real YouTube videos. Click any word for a grammar explanation. Type a translation and let Gemini grade you.

A full-stack language-learning app with a deliberately small surface area: no framework, no bundler, no auth — just Node.js, SQLite, and the browser's built-in APIs. Built end-to-end: database schema, offline AI pipeline, REST API, frontend, and spaced repetition.

---

## What it does

Pick a CEFR level (A1.1 → B2.2) and study 10 random flashcards drawn from a curated DW video at that level. Each card shows a German sentence on the front and its English translation on the back.

But it's more than a static deck:

- **🔊 Hear it** — every card has a TTS button that pronounces the German sentence using your OS's native voice (no external API).
- **🧠 Spaced repetition** — rate each card *Knew it* / *Didn't know*. Unknown cards come back later in the same session, and progress is persisted across sessions in `localStorage`.
- **📈 Progress** — streak counter, mastered-count, per-level progress bar.
- **🔍 Click any German word** → Gemini explains its meaning, part of speech (gender / case / conjugation), and usage in context. Live API call, ~3s round trip.
- **✍️ Type a translation** → Gemini grades it as correct or not, gives feedback, and shows a reference translation.
- **🎥 Paste any YouTube URL** → the offline pipeline runs *live*: transcript fetch → AI extraction → SQLite write → session starts with the fresh cards. ~10 seconds end to end.
- **🔗 Source provenance** — every card links back to the YouTube timestamp it was generated from.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| **Backend** | Node.js + Express | Smallest viable Node web server. ES modules throughout. |
| **Database** | SQLite via [Prisma](https://www.prisma.io/) | File-based, zero-setup, type-safe queries. One swap (`provider = "postgresql"`) to go to Postgres later. |
| **AI** | [Google Gemini](https://ai.google.dev/) `@google/genai` | Free tier, structured-output (`responseSchema`) guarantees JSON shape. |
| **Transcripts** | [`youtube-transcript`](https://www.npmjs.com/package/youtube-transcript) | Pulls public captions; no Google API key needed. |
| **Frontend** | Vanilla HTML / CSS / JS | The interactive surface is small enough that a framework's runtime cost outweighs its convenience. |
| **TTS** | Browser `speechSynthesis` API | Free, offline, no external API call. |
| **Persistence (frontend)** | `localStorage` | Progress + ratings, no auth needed. |

---

## Architecture at a glance

Two pipelines: one **offline** (pre-builds the card pool), one **live** (per-request AI).

### Offline — fill the database

```
seedVideos.js   ─►  Video table
                                                          
generateCards.js  ─►  for each Video:
                       ├─ fetch transcript (YouTube)
                       ├─ ask Gemini for sentence flashcards
                       └─ save to Card table  (FK → Video)
```

Run once; cards are cached in SQLite, so the runtime app never waits on Gemini.

### Runtime — serve & enrich

```
Browser ─► GET /api/cards?level=A1.1
        ◄── 10 random cards (JSON, with source video info)

Browser ─► POST /api/explain   { word, sentence }   → Gemini
Browser ─► POST /api/grade     { german, attempt }  → Gemini
Browser ─► POST /api/generate  { youtubeUrl, level } → offline pipeline, live
```

Four PlantUML diagrams in [`docs/architecture.puml`](docs/architecture.puml) cover the component layout, offline pipeline, runtime user flow, and the data model.

---

## Getting started

### Prereqs

- **Node.js 20.6+** (for the built-in `--env-file` flag)
- A free **Google Gemini API key** from [aistudio.google.com](https://aistudio.google.com) — no credit card, no phone.

### Install

```bash
git clone <repo-url>
cd "cards game/backend"
npm install
```

### Configure

Create `backend/.env`:

```
GEMINI_API_KEY=your_key_here
```

### Database

```bash
npx prisma migrate dev          # creates dev.db + tables
node prisma/seedVideos.js       # seeds 16 curated DW videos
```

### Pre-generate flashcards (one-off)

```bash
node --env-file=.env lib/generateCards.js
```

Runs the AI pipeline against every seeded video. Takes ~2 minutes (Gemini calls are sequential to avoid rate limits). Re-runnable — `deleteMany` + `createMany` keeps it idempotent.

To retry a single failed video (e.g. after a transient 503):

```bash
node --env-file=.env lib/generateCards.js <youtubeId>
```

### Run the app

```bash
npm run dev
```

Open <http://localhost:3000>, pick a level, study.

---

## What's in the box

```
cards game/
├── backend/
│   ├── app.js                    Express server + 5 API routes
│   ├── lib/
│   │   ├── fetchTranscript.js    Standalone test of caption fetching
│   │   ├── testGemini.js         Standalone test of a single AI call
│   │   └── generateCards.js      Full offline pipeline (CLI)
│   ├── prisma/
│   │   ├── schema.prisma         Video + Card models
│   │   ├── db.js                 PrismaClient singleton
│   │   └── seedVideos.js         Seed the 16 curated videos
│   └── .env                      GEMINI_API_KEY  (gitignored)
├── frontend/
│   ├── index.html                One-page UI
│   ├── style.css                 3D flip animation, modal, progress bar
│   └── script.js                 Session state, SR, TTS, AI calls
├── docs/
│   └── architecture.puml         4 PlantUML diagrams
├── README.md                     This file
└── ENGINEERING.md                Design decisions, tradeoffs, debugging stories
```

---

## Design decisions worth calling out

- **Cards are pre-generated, not on-demand.** Gemini calls are slow (~2–5s) and rate-limited; pre-generating makes the runtime app feel instant and keeps the free tier from getting nuked. The paste-a-URL feature exists for the "wow factor" — and bypasses the cache.
- **In-session spaced repetition + cross-session localStorage.** "Didn't know" cards get re-queued 3 positions later within the session. Across sessions, ratings are persisted per card ID; the mastered count and per-level progress bar derive from that.
- **Two Gemini models.** Offline batch uses `gemini-2.5-flash-lite` (cheaper for bulk). Live endpoints use `gemini-2.5-flash` (separate quota bucket so the app stays usable even if `-lite` is exhausted).
- **No-framework frontend.** Six interactive elements don't justify ~140KB of React runtime. Vanilla DOM APIs are sufficient here, and the cost (a small amount of imperative code) is bounded. The most interesting debugging story is in [ENGINEERING.md](ENGINEERING.md#the-css-specificity-bug-that-cost-an-hour) — a tied CSS specificity rule that masqueraded as a backend bug for 40 minutes.
- **All progress lives in the browser.** No accounts, no user table. localStorage is sufficient for single-user state, and skipping auth keeps the surface area tight. A real product would need a `User → Score` relation; see [ENGINEERING.md](ENGINEERING.md#production-gaps) for what would change.

---

## Roadmap

- [ ] Deploy to Render (free tier) with persistent SQLite volume
- [ ] Migrate SQLite → Postgres on Neon when going public
- [ ] Rate-limit the live AI endpoints (`express-rate-limit`)
- [ ] Click-the-source-video to jump to the exact transcript timestamp the card came from
- [ ] Mobile keyboard / responsive layout polish
- [ ] Optional Whisper-based pronunciation grading

---

## Engineering notes

[ENGINEERING.md](ENGINEERING.md) covers the design decisions, tradeoffs, and notable bugs in detail. The recurring themes:

- One-to-many relations with a deliberately nullable FK so the schema doesn't lock out hand-authored cards
- Structured outputs (`responseSchema`) on the AI calls — the line between a fragile script and a reliable pipeline
- Two Gemini models for two quota buckets — runtime stays usable even when the batch script exhausts its daily budget
- Idempotent CLI tools (`deleteMany` + `createMany`) so re-runs are always safe
- Errors logged with enough specificity to act on, not enough to ignore

---

## Credits

- Curated video content from [Deutsche Welle](https://learngerman.dw.com/) — *Nicos Weg* and *Ticket nach Berlin* series.
- The flashcard mechanic owes a debt to [Anki](https://apps.ankiweb.net/) and its spaced-repetition algorithm.

# Flipdeutsch — German Flashcards

Pick a CEFR level (A1.1 → B2.2) and flip through 10 random German flashcards. Each card shows a German sentence on the front and its English translation on the back.

Cards are AI-generated: an offline script fetches the captions from a curated YouTube video, sends them to Google Gemini, and stores the resulting sentence-level flashcards in a local SQLite database.

## Tech stack

- **Backend:** Node.js, Express
- **Database:** SQLite via [Prisma](https://www.prisma.io/) ORM
- **AI:** [Google Gemini](https://ai.google.dev/) (`@google/genai`)
- **Transcripts:** [`youtube-transcript`](https://www.npmjs.com/package/youtube-transcript)
- **Frontend:** Vanilla HTML / CSS / JavaScript (no framework, no bundler)

## Features

- 8 CEFR levels: A1.1, A1.2, A2.1, A2.2, B1.1, B1.2, B2.1, B2.2
- Sentence-level flashcards (not isolated words)
- Each card is linked to the YouTube video it was generated from
- 3D flip animation in pure CSS

## Getting started

### Prerequisites

- Node.js **20.6 or higher** (for the built-in `--env-file` flag)
- A free Google Gemini API key from [aistudio.google.com](https://aistudio.google.com) (no credit card required)

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
npx prisma migrate dev
npx prisma db seed
```

This creates `backend/prisma/dev.db` and seeds the `Video` table with curated YouTube videos for each level.

### Generate flashcards for a video

```bash
node --env-file=.env lib/generateCards.js
```

The script fetches the transcript, asks Gemini for sentence-level flashcards, and saves them to the `Card` table.

### Run the web app

```bash
npm run dev
```

Then open <http://localhost:3000>.

## Project structure

```
cards game/
├── backend/
│   ├── app.js                    Express server
│   ├── lib/
│   │   ├── fetchTranscript.js    Test: fetch a YouTube transcript
│   │   ├── testGemini.js         Test: a single Gemini API call
│   │   └── generateCards.js      Full offline AI pipeline
│   └── prisma/
│       ├── schema.prisma         Video + Card models
│       ├── db.js                 PrismaClient singleton
│       └── seedVideos.js         Seeds the Video table
├── frontend/                     Static HTML / CSS / JS
└── docs/
    └── architecture.puml         Four PlantUML diagrams
```

## Architecture

See `docs/architecture.puml` for four PlantUML diagrams: component layout, the offline AI pipeline, the runtime user flow, and the data model. Render them in VS Code with the [PlantUML extension](https://marketplace.visualstudio.com/items?itemName=jebbs.plantuml) by *jebbs*.

## Status

Work in progress — built as a learning project. The offline AI pipeline (`lib/generateCards.js`) is working end-to-end. The Express API and frontend are next.

See `LEARNING.md` for a step-by-step build journal and concept notes.

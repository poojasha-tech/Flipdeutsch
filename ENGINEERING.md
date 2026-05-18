# Engineering Notes — Flipdeutsch

Design decisions, tradeoffs, and notable debugging stories from this codebase. For setup and feature overview, see [README.md](README.md).

---

## Data model

Two tables, one relation:

```prisma
model Video {
  id        Int      @id @default(autoincrement())
  youtubeId String   @unique
  title     String
  level     String
  createdAt DateTime @default(now())
  cards     Card[]
}

model Card {
  id        Int      @id @default(autoincrement())
  level     String                      // redundant with video.level — see below
  german    String
  english   String
  videoId   Int?                         // nullable — see below
  video     Video?   @relation(fields: [videoId], references: [id])
  createdAt DateTime @default(now())
}
```

**Why `videoId` is nullable.** Hand-authored or imported cards may not have a source video. Forcing every Card to have a parent would block that workflow. The tradeoff is that "orphan" rows are legal in the schema — fine here, because every query that depends on a video uses `include: { video }` and treats absence as "no source available."

**Why `level` is duplicated on Card.** The hottest query in the app is `findMany({ where: { level } })`. Reading it off `Card.level` is one column lookup; pulling it through the Video relation would force a join on every read. Storing the level twice trades a denormalized column for query speed — the tradeoff is acceptable because cards don't migrate between levels and the value is set once at write time.

---

## Offline AI pipeline (`lib/generateCards.js`)

A CLI script that batches transcript fetch → Gemini → DB write across every seeded video. Runs sequentially, not in parallel, because Gemini's free tier rate-limits anything faster.

```js
for (const video of videos) {
  try { await generateCardsForVideo(video); }
  catch (e) { console.error(`Failed for ${video.title}:`, e.message); }
}
```

**Why a separate offline script (not on-demand at runtime).** Gemini calls cost 2–5s each and consume daily-quota budget. Pre-generating cards into SQLite makes the runtime app feel instant and survives the free tier indefinitely. The cost is a stale-cache problem (cards don't auto-update when the source video changes) — acceptable for a learning app, would matter for production.

**Idempotency: `deleteMany` then `createMany`.** Re-running the script for the same video wipes its existing cards and inserts fresh ones. Without this, every run would double the deck.

**Per-video try/catch, not per-batch.** A bad transcript or a transient 503 on video #7 shouldn't kill the run for videos #8–16. The error is logged with the video title for retryability.

**Optional CLI argument as a filter.** Passing a YouTube ID runs the pipeline for just that one video — useful for retrying single failures without burning quota on the rest:

```bash
node --env-file=.env lib/generateCards.js 0bm1BKmChro
```

**Structured outputs with `responseSchema`.** Gemini's `config.responseSchema` enforces the JSON shape on the model's side, removing the need to parse markdown-wrapped output or write regex against `"```json"` fences. Without it, the script would be one prompt-engineering tweak away from breaking.

---

## Live AI endpoints

Three POST endpoints, all backed by `gemini-2.5-flash` (separate quota bucket from `-flash-lite` used by the offline pipeline):

- **`POST /api/explain`** — `{ word, sentence }` → grammar explanation in plain text.
- **`POST /api/grade`** — `{ german, userTranslation }` → typed JSON via `responseSchema` (`{ correct, feedback, betterTranslation }`).
- **`POST /api/generate`** — `{ youtubeUrl, level }` → runs the offline pipeline live, returns the saved cards.

**Why two Gemini models.** Free-tier quota is per-model. Generating all 16 videos exhausts `-flash-lite` for the day; running the live endpoints on the same model would leave the runtime app unusable. Splitting them gives each pipeline its own daily budget — the offline batch runs on the cheaper model overnight, the interactive UI runs on the larger model during the day.

**`parseGeminiError()` translates 429s.** Gemini's JS SDK puts a JSON payload inside the thrown `Error.message`. Parsing it lets the API return `429` with a useful "retry in N seconds" message instead of a generic `500`. Without this, frontend users see "something went wrong" and can't tell whether it's a bug or a quota cap.

**Find-or-create for user-submitted videos (`/api/generate`).** The endpoint accepts any YouTube URL, parses out the 11-char ID via regex, and either finds the existing Video row or creates a new one with a placeholder title. Same downstream pipeline either way — minimal surface area for a feature that doubles as a demo.

---

## Frontend state model

No framework. All state lives in three places:

| Where | What | Why |
|---|---|---|
| `let queue, position, sessionStats` | Current session — the working card queue and position | Ephemeral; rebuilt on every level pick |
| `localStorage['flipdeutsch:scores']` | Per-card ratings, keyed by card id | Survives page reloads, no server roundtrip |
| `localStorage['flipdeutsch:stats']` | `{ lastDate, streak }` | Streak math only needs date arithmetic |

**Why no framework.** This app has roughly six interactive elements. Adding React would be ~140KB of runtime for state primitives the browser already has. The cost of skipping the framework is a small amount of imperative DOM code (`element.classList.toggle('flipped')`) — cheap at this scale.

**In-session spaced repetition.** "Didn't know" splices the card back into the queue 4 positions later:

```js
if (rating === 'didnt') queue.splice(position + 4, 0, card);
```

The queue is allowed to grow during a session — `position` walks through it linearly. Not a full SM-2 SRS algorithm, but enough to surface struggles in the same session.

**Cross-session persistence is one-way.** Ratings are written to `localStorage` on every rate event. Reads happen only on render — header stats, per-level progress bar. The app never tries to sync `localStorage` back to the server because there's no user account to sync against.

**Streak calculation dodges DST.** Bumps once per calendar day using `Date.toISOString().slice(0, 10)`:

```js
const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
stats.streak = (stats.lastDate === yesterday) ? stats.streak + 1 : 1;
```

This is correct *enough* — works in 99% of timezones, would drift across DST changes by a few hours. Real implementation would use a date library and the user's IANA timezone. Out of scope here.

**3D card flip is pure CSS.** The mental model: `.card` is a hinge with `transform-style: preserve-3d`; both faces are absolutely positioned with `backface-visibility: hidden`; the back face is pre-rotated 180°. Toggling `.flipped` swaps which face the user sees. No JS animation library required.

---

## Notable debugging stories

### The CSS specificity bug that cost an hour

Symptom: a modal that should only appear on word-click was visible at page load, showing its initial "Asking Gemini…" placeholder, and unresponsive to its own close handlers. The user (correctly) reported "the popup is stuck and nothing works."

What I checked first (wrong): the backend. Curled `/api/explain` — returned 200. Switched models, added error parsing for 429 quotas, added diagnostic logging. None of it mattered, because the network request was never being made.

Actual cause — a tied CSS specificity rule resolved by source order:

```css
.hidden { display: none; }    /* line 100 */
.modal  { display: flex; }    /* line 407 */
```

Both selectors are single-class — same specificity. When CSS specificity ties, the rule declared *later in the file* wins. `<div class="modal hidden">` resolved to `display: flex`, and `classList.add('hidden')` did nothing because the cascade kept overriding back. The modal had never been hidden in the first place.

One-line fix:

```css
.hidden { display: none !important; }
```

`!important` is correct here because utility classes exist *to override*. Every popular CSS framework's `.hidden` / `.d-none` / etc. is effectively `!important` under the hood.

**The general lesson:** "the output is wrong" and "the right thing isn't happening" look identical from the outside. I spent 40 minutes debugging a fetch that never ran. A Network panel check would have shown zero requests on word-click in 5 seconds — and ruled out the entire backend before touching it.

### "Parameter ≠ argument"

Early version of the card-save function:

```js
async function generateCards(videoId) {
  // ...
  const video = await prisma.video.findUnique({ where: { id: videoId } });
}
```

The parameter named `videoId` actually held a *YouTube* string ID (`"dC6ZGLzdaTs"`), not the Int primary key. The lookup matched nothing. The right fix was `where: { youtubeId: videoId }`, but the *better* fix was renaming the parameter to `youtubeId` so it couldn't lie about what it contained.

**Lesson:** names that lie are bugs in waiting. The compiler doesn't help you when both fields exist on the same table.

### "It exited without error" ≠ "It worked"

After running `generateCards.js` for the first time, Prisma Studio showed an empty Card table. The script's log:

```
Generating cards for 0 videos...
All done.
```

The Video table was empty — the seed script had never been run against this DB. The pipeline iterated over zero videos, did nothing, exited cleanly. "All done." was technically true.

**Lesson:** log the *outcome* of each operation, not just the absence of crashes. `Saved N cards for "title"` is informative; `All done.` is just noise.

### Quota exhaustion hidden behind a vague error

Hitting `/api/explain` consistently returned `{"error":"Could not get an explanation. Try again."}`. Looked like a backend bug; was actually `gemini-2.5-flash-lite` having burned its 20-requests-per-day free-tier limit during card generation.

The fix wasn't on the explain endpoint — it was at the model layer: switch the live endpoints to `gemini-2.5-flash` (a different quota bucket) and have `parseGeminiError()` surface 429s with the retry-after duration so future quota issues are obvious in the UI.

**Lesson:** errors should be specific enough to act on. "Could not get an explanation" wastes everyone's time. "Free-tier quota exhausted — retry in 25 seconds" closes the case.

---

## Production gaps

Honest list of what would change before this could ship publicly:

- **Rate limiting on live endpoints.** Anyone with the URL can spam `/api/generate` and drain the Gemini quota in minutes. `express-rate-limit` with a per-IP cap would close this.
- **SQLite persistence on hosted free tiers.** Render/Fly free containers wipe their filesystem on restart. Either pay for a persistent volume or migrate to Postgres on Neon — one line in `schema.prisma` (`provider = "postgresql"`).
- **No auth.** All state lives in browser localStorage. Per-device, lost on browser-data-clear, no cross-device sync. Acceptable for a personal tool; a real product needs accounts and a `User → Score` relation.
- **No retry/backoff for transient Gemini failures.** A single 503 in the offline pipeline currently surfaces as a logged error and skipped video. Production would want exponential backoff (3 retries, 1s/2s/4s) before declaring a failure.
- **Tokenization is naive.** `tokenizeGerman()` splits on whitespace and strips punctuation. Compound nouns stay glued (correct here), but contractions and inflected forms aren't lemmatized — `gegangen` and `gehen` look different to the explain endpoint. A real implementation would hit a German morphology library or send the surface form *with* its lemma.
- **No tests.** A small project tolerates this; a multi-person codebase doesn't. The pipeline is the obvious test target — given a fixed transcript, assert the AI call shape, then mock Gemini and assert the DB writes.

---

## Reference

- **Node 20.6+** for the built-in `--env-file=.env` flag (avoids the `dotenv` dependency).
- **ES modules require `.js` extension** on relative imports (`import prisma from "../prisma/db.js"`). No `__dirname` — reconstruct via `path.dirname(fileURLToPath(import.meta.url))`.
- **Prisma model names are PascalCase** in `schema.prisma`; the generated client lowercases them (`prisma.card`, not `prisma.Card`).
- **Prisma `findUnique` requires a `@unique` field** in the `where` clause. Use `findFirst` for non-unique columns.
- **`prisma.$disconnect()` in `finally`** — without it, the script hangs ~10s on exit waiting for the connection pool.

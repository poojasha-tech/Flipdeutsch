// ⚠️ The youtubeId values below are PLACEHOLDERS, not real video IDs.
// Before running the AI generation script (Task 9+), replace each placeholder
// with a real 11-character YouTube ID for a video you've verified at the
// correct CEFR level. Recommended channels:
//   - Easy German            https://www.youtube.com/@EasyGerman
//   - Nicos Weg (DW)         https://www.youtube.com/playlist?list=PLDA0241D5BD90948A
//   - Learn German with Anja https://www.youtube.com/@LearnGermanwithAnja
//   - DW Learn German        https://www.youtube.com/@dwlearngerman
// Find the ID in the URL after `v=`: youtube.com/watch?v=THIS_IS_THE_ID

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const videos = [
  // A1.1 — beginner basics
  { level: "A1.1", youtubeId: "RuGmc662HDg", title: "Greetings and Introductions" },
  { level: "A1.1", youtubeId: "XEGITixasIs", title: "Numbers and the Alphabet" },

  // A1.2 — Nicos Weg A1 (later episodes)
  { level: "A1.2", youtubeId: "T89sIATrpBc", title: "Nicos Weg A1 Folge 8: Nico hat ein Problem" },
  { level: "A1.2", youtubeId: "SRAk_KZlrwY", title: "Nicos Weg A1 Folge 51: Sonst noch etwas?" },

  // A2.1 — Nicos Weg A2 (early)
  { level: "A2.1", youtubeId: "ZPQepR4B8eo", title: "Nicos Weg A2 Folge 1: Lebenslinien" },
  { level: "A2.1", youtubeId: "WB4YmgiRULw", title: "Nicos Weg A2 Folge 2: Angekommen" },

  // A2.2 — Nicos Weg A2 (later)
  { level: "A2.2", youtubeId: "oEWakpD2JaQ", title: "Nicos Weg A2 Folge 21: Alltag und Freizeit" },
  { level: "A2.2", youtubeId: "xuVnMMMztx0", title: "Nicos Weg A2 Folge 30: Das Internet" },

  // B1.1 — Nicos Weg B1 (early)
  { level: "B1.1", youtubeId: "o1zJ-BNQrU0", title: "Nicos Weg B1 Folge 1: Berufsberatung" },
  { level: "B1.1", youtubeId: "2itTid0YMtw", title: "Nicos Weg B1 Folge 3: Bei der Arbeit" },

  // B1.2 — Nicos Weg B1 (later)
  { level: "B1.2", youtubeId: "Gf-CF34SJJU", title: "Nicos Weg B1 Folge 10: Krieg und Frieden" },
  { level: "B1.2", youtubeId: "VQUA15tTF44", title: "Nicos Weg B1 Folge 33: Schule" },

  // B2.1 — Ticket nach Berlin (DW B2 adventure series)
  { level: "B2.1", youtubeId: "zOtgWjCRgtc", title: "Ticket nach Berlin Folge 1: Zugspitze" },
  { level: "B2.1", youtubeId: "4pjFD2Qdieg", title: "Ticket nach Berlin Folge 2: Pellworm" },

  // B2.2 — Ticket nach Berlin (later episodes)
  { level: "B2.2", youtubeId: "hiQ7cNfEuVU", title: "Ticket nach Berlin Folge 4: Hamburg" },
  { level: "B2.2", youtubeId: "0bm1BKmChro", title: "Ticket nach Berlin Folge 18: Berlin (2)" },
];

async function main() {
  // Wipe first so re-running stays idempotent.
  await prisma.video.deleteMany();

  const result = await prisma.video.createMany({ data: videos });
  console.log(`Seeded ${result.count} videos`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

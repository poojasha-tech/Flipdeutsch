// ============================================================
// Flipdeutsch — frontend logic
// Features: TTS, source video link, spaced repetition, progress
// All progress is stored in localStorage (no auth, no backend state).
// ============================================================

const SCORES_KEY = 'flipdeutsch:scores';   // per-card ratings
const STATS_KEY  = 'flipdeutsch:stats';    // streak, last session date

// --- DOM refs ---
const levelSelect = document.getElementById('level');
const cardStage   = document.getElementById('card-stage');
const card        = document.getElementById('card');
const germanEl    = document.getElementById('german');
const englishEl   = document.getElementById('english');
const ttsBtn      = document.getElementById('tts-btn');
const ratingEl    = document.getElementById('rating');
const knewBtn     = document.getElementById('knew-it');
const didntBtn    = document.getElementById('didnt-know');
const progressEl  = document.getElementById('progress');
const hintEl      = document.getElementById('hint');
const sourceEl    = document.getElementById('source');
const emptyMsg    = document.getElementById('empty');
const doneEl      = document.getElementById('done');
const doneSummary = document.getElementById('done-summary');
const restartBtn  = document.getElementById('restart');
const streakEl    = document.getElementById('streak');
const masteredEl  = document.getElementById('mastered');
const levelProgress = document.getElementById('level-progress');
const levelMasteredEl = document.getElementById('level-mastered');
const levelTotalEl = document.getElementById('level-total');
const levelNameEl  = document.getElementById('level-name');
const progressFill = document.getElementById('progress-fill');

// --- State for the current session ---
let queue = [];           // working queue (may grow if user re-queues "didn't know" cards)
let position = 0;         // index into queue
let sessionStats = { knew: 0, didnt: 0 };
let totals = {};          // { 'A1.1': 47, 'A1.2': 72, ... } from /api/stats

// --- localStorage helpers ---
function loadScores() {
    try { return JSON.parse(localStorage.getItem(SCORES_KEY)) || {}; }
    catch { return {}; }
}
function saveScores(scores) {
    localStorage.setItem(SCORES_KEY, JSON.stringify(scores));
}
function loadStats() {
    try { return JSON.parse(localStorage.getItem(STATS_KEY)) || { lastDate: null, streak: 0 }; }
    catch { return { lastDate: null, streak: 0 }; }
}
function saveStats(s) {
    localStorage.setItem(STATS_KEY, JSON.stringify(s));
}

// --- Streak: bump it once per calendar day ---
function bumpStreak() {
    const today = new Date().toISOString().slice(0, 10);
    const stats = loadStats();
    if (stats.lastDate === today) return;            // already counted today
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    stats.streak = (stats.lastDate === yesterday) ? stats.streak + 1 : 1;
    stats.lastDate = today;
    saveStats(stats);
}

// --- Header stats ---
function refreshHeaderStats() {
    const scores = loadScores();
    const stats = loadStats();
    streakEl.textContent = stats.streak;
    masteredEl.textContent = Object.values(scores).filter(s => s.rating === 'knew').length;
}

// --- Per-level progress bar ---
function refreshLevelProgress(level) {
    const total = totals[level] || 0;
    if (total === 0) {
        levelProgress.classList.add('hidden');
        return;
    }
    const scores = loadScores();
    // Count cards mastered for this level — we tag each score entry with the level when saving.
    const masteredInLevel = Object.values(scores)
        .filter(s => s.rating === 'knew' && s.level === level).length;
    levelMasteredEl.textContent = masteredInLevel;
    levelTotalEl.textContent = total;
    levelNameEl.textContent = level;
    progressFill.style.width = `${Math.min(100, (masteredInLevel / total) * 100)}%`;
    levelProgress.classList.remove('hidden');
}

// --- Text-to-speech ---
function speak(text) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();   // stop anything currently playing
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
}

// --- Rendering ---
function renderCard() {
    if (position >= queue.length) {
        showSessionDone();
        return;
    }
    const c = queue[position];
    germanEl.textContent = c.german;
    englishEl.textContent = c.english;
    progressEl.textContent = `${position + 1} / ${queue.length}`;
    card.classList.remove('flipped');
    ratingEl.classList.add('hidden');
    hintEl.classList.remove('hidden');

    // Source video link (if the card has a video attached)
    if (c.video) {
        sourceEl.innerHTML = `Source: <a href="https://www.youtube.com/watch?v=${c.video.youtubeId}" target="_blank" rel="noopener">${c.video.title}</a>`;
    } else {
        sourceEl.textContent = '';
    }
}

function showSessionDone() {
    cardStage.classList.add('hidden');
    doneSummary.textContent = `You knew ${sessionStats.knew} of ${sessionStats.knew + sessionStats.didnt} cards.`;
    doneEl.classList.remove('hidden');
    bumpStreak();
    refreshHeaderStats();
    refreshLevelProgress(levelSelect.value);
}

// --- Rate a card ---
function rate(rating) {
    const c = queue[position];
    const scores = loadScores();
    // Store the level too so we can compute per-level "mastered" counts later.
    scores[c.id] = { rating, level: c.level, lastSeen: Date.now() };
    saveScores(scores);
    sessionStats[rating === 'knew' ? 'knew' : 'didnt']++;

    // If user didn't know, requeue the card later in the session so they see it again.
    if (rating === 'didnt') {
        queue.splice(position + 4, 0, c);
    }
    position++;
    renderCard();
}

// --- Start a session ---
async function startSession(level) {
    doneEl.classList.add('hidden');
    emptyMsg.classList.add('hidden');

    const res = await fetch(`/api/cards?level=${encodeURIComponent(level)}&limit=10`);
    const cards = await res.json();

    if (cards.length === 0) {
        cardStage.classList.add('hidden');
        emptyMsg.classList.remove('hidden');
        return;
    }

    queue = [...cards];
    position = 0;
    sessionStats = { knew: 0, didnt: 0 };

    cardStage.classList.remove('hidden');
    renderCard();
    refreshLevelProgress(level);
}

// --- Fetch totals (per-level card counts) once at boot ---
async function loadTotals() {
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        totals = Object.fromEntries(data.map(d => [d.level, d.total]));
    } catch (e) {
        console.warn('Could not load stats', e);
    }
}

// --- Event wiring ---
levelSelect.addEventListener('change', (e) => {
    const level = e.target.value;
    if (level) startSession(level);
});

card.addEventListener('click', () => {
    if (!card.classList.contains('flipped')) {
        card.classList.add('flipped');
        ratingEl.classList.remove('hidden');
        hintEl.classList.add('hidden');
    }
});

ttsBtn.addEventListener('click', (e) => {
    e.stopPropagation();           // don't bubble to card click → don't flip
    speak(germanEl.textContent);
});

knewBtn.addEventListener('click', () => rate('knew'));
didntBtn.addEventListener('click', () => rate('didnt'));

restartBtn.addEventListener('click', () => {
    if (levelSelect.value) startSession(levelSelect.value);
});

// --- Init ---
loadTotals();
refreshHeaderStats();

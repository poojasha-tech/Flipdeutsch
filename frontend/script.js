// Grab DOM references once at the top
const levelSelect = document.getElementById('level');
const cardStage = document.getElementById('card-stage');
const card = document.getElementById('card');
const germanEl = document.getElementById('german');
const englishEl = document.getElementById('english');
const nextBtn = document.getElementById('next');
const progressEl = document.getElementById('progress');
const emptyMsg = document.getElementById('empty');

// State
let cards = [];
let index = 0;

// When the user picks a level, fetch 10 cards from the API
levelSelect.addEventListener('change', async (e) => {
    const level = e.target.value;
    if (!level) return;

    const res = await fetch(`/api/cards?level=${encodeURIComponent(level)}`);
    cards = await res.json();
    index = 0;

    // Reset flip state
    card.classList.remove('flipped');

    if (cards.length === 0) {
        cardStage.classList.add('hidden');
        emptyMsg.classList.remove('hidden');
        return;
    }

    emptyMsg.classList.add('hidden');
    cardStage.classList.remove('hidden');
    render();
});

// Click the card to flip — CSS handles the animation
card.addEventListener('click', () => {
    card.classList.toggle('flipped');
});

// Next button advances to the next card
nextBtn.addEventListener('click', () => {
    if (index < cards.length - 1) {
        index++;
        card.classList.remove('flipped'); // always start unflipped
        render();
    }
});

function render() {
    const c = cards[index];
    germanEl.textContent = c.german;
    englishEl.textContent = c.english;
    progressEl.textContent = `${index + 1} / ${cards.length}`;
    nextBtn.disabled = index >= cards.length - 1;
}

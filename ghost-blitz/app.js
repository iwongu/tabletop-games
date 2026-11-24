import { ITEMS, generateDeck } from './engine.js';

const STORAGE_SETTINGS = 'ghost-blitz-settings-v1';
const STORAGE_RECORDS = 'ghost-blitz-records-v1';
const BLITZ_DURATION_MS = 60_000;

const MODE_LABELS = {
  sprint: 'Sprint',
  blitz: '60s',
  zen: 'Zen',
  duel: '2P Duel',
};

const defaultSettings = {
  labels: true,
  sound: true,
};

const defaultRecords = {
  sprintBestMs: null,
  blitzBestScore: 0,
  bestStreak: 0,
  totalMatches: 0,
};

const state = {
  mode: 'sprint',
  deck: [],
  currentCard: null,
  matches: 0,
  mistakes: 0,
  streak: 0,
  maxStreak: 0,
  score: 0,
  duelScoreP1: 0,
  duelScoreP2: 0,
  duelLockP1: false,
  duelLockP2: false,
  startTime: null,
  elapsedMs: 0,
  blitzPenaltyMs: 0,
  timerId: null,
  toastTimerId: null,
  locked: false,
  finished: false,
  settings: loadJson(STORAGE_SETTINGS, defaultSettings),
  records: loadJson(STORAGE_RECORDS, defaultRecords),
};

// DOM references
const elShell = document.getElementById('app-shell');
const elModeTrigger = document.getElementById('btn-mode');
const elModeLabel = document.getElementById('mode-trigger-label');
const elHudStats = document.getElementById('hud-stats');
const elTimerWrap = document.getElementById('stat-timer-wrap');
const elTimer = document.getElementById('stat-timer');
const elScore = document.getElementById('stat-score');
const elScoreLabel = document.getElementById('stat-score-label');
const elStreakWrap = document.getElementById('stat-streak-wrap');
const elStreak = document.getElementById('stat-streak');
const elStatus = document.getElementById('status-banner');
const elStatusText = document.getElementById('status-text');

const elSoloStage = document.getElementById('solo-stage');
const elSoloCard = document.getElementById('solo-card');
const elSoloTray = document.getElementById('solo-tray');

const elDuelStage = document.getElementById('duel-stage');
const elDuelCard = document.getElementById('duel-card');
const elDuelTrayP1 = document.getElementById('duel-tray-p1');
const elDuelTrayP2 = document.getElementById('duel-tray-p2');
const elDuelScoreP1 = document.getElementById('duel-score-p1');
const elDuelScoreP2 = document.getElementById('duel-score-p2');
const elDuelDeckLeft = document.getElementById('duel-deck-left');
const elDuelFeedback = document.getElementById('duel-feedback');

const elBtnHint = document.getElementById('btn-hint');
const elBtnNew = document.getElementById('btn-new');
const elBtnRules = document.getElementById('btn-rules');
const elBtnSettings = document.getElementById('btn-settings');

const dialogRules = document.getElementById('dialog-rules');
const dialogSettings = document.getElementById('dialog-settings');
const dialogWin = document.getElementById('dialog-win');
const optLabels = document.getElementById('opt-labels');
const optSound = document.getElementById('opt-sound');
const elSchemeHint = document.getElementById('scheme-system-hint');
const elRecordsGrid = document.getElementById('records-grid');

// --- Hand-Crafted Vector SVG Artwork for All 5 Iconic Ghost Blitz Objects ---
function renderItemSvg(shapeId, colorId) {
  const c = ITEMS[colorId];
  const fill = c.colorHex;
  const stroke = c.strokeHex;
  const eyeFill = colorId === 0 ? '#1e293b' : '#ffffff';
  const accent = colorId === 0 ? '#cbd5e1' : 'rgba(255,255,255,0.28)';

  switch (shapeId) {
    case 0: // Ghost
      return `<svg viewBox="0 0 120 120" aria-hidden="true">
        <path d="M60 12 C34 12 20 32 20 58 L20 100 C20 104 25 106 29 102 L38 93 C41 90 45 90 48 93 L55 101 C58 104 62 104 65 101 L72 93 C75 90 79 90 82 93 L91 102 C95 106 100 104 100 100 L100 58 C100 32 86 12 60 12 Z"
          fill="${fill}" stroke="${stroke}" stroke-width="4.5" stroke-linejoin="round"/>
        <ellipse cx="45" cy="48" rx="7" ry="9" fill="${eyeFill}"/>
        <ellipse cx="75" cy="48" rx="7" ry="9" fill="${eyeFill}"/>
        <circle cx="47" cy="46" r="2.6" fill="${colorId === 0 ? '#fff' : '#1e293b'}"/>
        <circle cx="77" cy="46" r="2.6" fill="${colorId === 0 ? '#fff' : '#1e293b'}"/>
        <ellipse cx="60" cy="68" rx="8" ry="6" fill="${eyeFill}" opacity="0.85"/>
      </svg>`;

    case 1: // Bottle
      return `<svg viewBox="0 0 120 120" aria-hidden="true">
        <rect x="49" y="10" width="22" height="10" rx="3" fill="#d97706" stroke="${stroke}" stroke-width="3.5"/>
        <path d="M48 20 L72 20 L72 38 C72 45 84 52 84 64 L84 102 C84 107 79 110 73 110 L47 110 C41 110 36 107 36 102 L36 64 C36 52 48 45 48 38 Z"
          fill="${fill}" stroke="${stroke}" stroke-width="4.5" stroke-linejoin="round"/>
        <rect x="42" y="68" width="36" height="22" rx="4" fill="${accent}" stroke="${stroke}" stroke-width="2.5"/>
        <path d="M44 62 L44 98" stroke="rgba(255,255,255,0.45)" stroke-width="4" stroke-linecap="round"/>
      </svg>`;

    case 2: // Chair
      return `<svg viewBox="0 0 120 120" aria-hidden="true">
        <rect x="30" y="14" width="60" height="44" rx="7" fill="${fill}" stroke="${stroke}" stroke-width="4.5"/>
        <line x1="46" y1="22" x2="46" y2="50" stroke="${stroke}" stroke-width="4" stroke-linecap="round"/>
        <line x1="60" y1="22" x2="60" y2="50" stroke="${stroke}" stroke-width="4" stroke-linecap="round"/>
        <line x1="74" y1="22" x2="74" y2="50" stroke="${stroke}" stroke-width="4" stroke-linecap="round"/>
        <rect x="22" y="56" width="76" height="15" rx="5" fill="${fill}" stroke="${stroke}" stroke-width="4.5"/>
        <rect x="28" y="71" width="11" height="37" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="4"/>
        <rect x="81" y="71" width="11" height="37" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="4"/>
        <line x1="39" y1="90" x2="81" y2="90" stroke="${stroke}" stroke-width="4.5"/>
      </svg>`;

    case 3: // Book
      return `<svg viewBox="0 0 120 120" aria-hidden="true">
        <path d="M24 22 C24 16 29 12 36 12 L94 12 L94 96 L36 96 C29 96 24 100 24 106 Z"
          fill="${fill}" stroke="${stroke}" stroke-width="4.5" stroke-linejoin="round"/>
        <path d="M24 96 C24 90 29 86 36 86 L94 86 L94 108 L36 108 C29 108 24 104 24 98 Z"
          fill="#fef3c7" stroke="${stroke}" stroke-width="4" stroke-linejoin="round"/>
        <line x1="38" y1="14" x2="38" y2="85" stroke="${stroke}" stroke-width="4"/>
        <rect x="50" y="30" width="32" height="14" rx="3" fill="${accent}" stroke="${stroke}" stroke-width="2.5"/>
        <path d="M68 86 L68 112 L75 106 L82 112 L82 86 Z" fill="#f59e0b" stroke="${stroke}" stroke-width="2.5"/>
      </svg>`;

    case 4: // Mouse
    default:
      return `<svg viewBox="0 0 120 120" aria-hidden="true">
        <path d="M84 88 C102 88 108 70 98 58" fill="none" stroke="${stroke}" stroke-width="5" stroke-linecap="round"/>
        <circle cx="38" cy="34" r="18" fill="${fill}" stroke="${stroke}" stroke-width="4.5"/>
        <circle cx="38" cy="34" r="9" fill="#fda4af"/>
        <circle cx="78" cy="34" r="18" fill="${fill}" stroke="${stroke}" stroke-width="4.5"/>
        <circle cx="78" cy="34" r="9" fill="#fda4af"/>
        <ellipse cx="58" cy="68" rx="34" ry="30" fill="${fill}" stroke="${stroke}" stroke-width="4.5"/>
        <circle cx="46" cy="60" r="4.5" fill="${eyeFill}"/>
        <circle cx="70" cy="60" r="4.5" fill="${eyeFill}"/>
        <ellipse cx="58" cy="76" rx="7" ry="5" fill="#fb7185" stroke="${stroke}" stroke-width="2.5"/>
        <line x1="22" y1="72" x2="40" y2="75" stroke="${stroke}" stroke-width="3" stroke-linecap="round"/>
        <line x1="22" y1="81" x2="40" y2="79" stroke="${stroke}" stroke-width="3" stroke-linecap="round"/>
        <line x1="76" y1="75" x2="94" y2="72" stroke="${stroke}" stroke-width="3" stroke-linecap="round"/>
        <line x1="76" y1="79" x2="94" y2="81" stroke="${stroke}" stroke-width="3" stroke-linecap="round"/>
      </svg>`;
  }
}

// --- Storage ---
function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

function saveJson(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}

// --- Web Audio ---
let audioCtx = null;

function playTone(type, streak = 1) {
  if (!state.settings.sound) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const tone = (freq, start, dur, gainPeak, wave = 'sine') => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = wave;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(gainPeak, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    };

    if (type === 'match') {
      const boost = Math.min(streak - 1, 8) * 30;
      tone(540 + boost, now, 0.1, 0.08, 'triangle');
      tone(780 + boost, now + 0.05, 0.14, 0.08, 'sine');
    } else if (type === 'wrong') {
      tone(200, now, 0.14, 0.07, 'sawtooth');
    } else if (type === 'hint') {
      tone(440, now, 0.12, 0.05, 'sine');
    } else if (type === 'win') {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        tone(f, now + i * 0.085, 0.25, 0.09)
      );
    }
  } catch {}
}

// --- Color Scheme (modern-web-guidance: dark-mode-toggle) ---
const metaColorScheme = document.querySelector('meta[name="color-scheme"]');
const systemDarkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function getStoredScheme() {
  try {
    const val = localStorage.getItem('color-scheme');
    return val === 'light' || val === 'dark' ? val : 'system';
  } catch {
    return 'system';
  }
}

function updateSystemSchemeHint() {
  const choice = getStoredScheme();
  const current = systemDarkQuery.matches ? 'dark' : 'light';
  elSchemeHint.textContent =
    choice === 'system'
      ? `System (currently ${current})`
      : `Pinned to ${choice} (system is ${current})`;
}

function applyScheme(choice, persist = true) {
  metaColorScheme.content = choice === 'system' ? 'light dark' : choice;
  if (persist) {
    try {
      if (choice === 'system') localStorage.removeItem('color-scheme');
      else localStorage.setItem('color-scheme', choice);
    } catch {}
  }
  for (const btn of document.querySelectorAll('.seg-btn[data-scheme]')) {
    btn.setAttribute('aria-checked', String(btn.dataset.scheme === choice));
  }
  updateSystemSchemeHint();
}

systemDarkQuery.addEventListener('change', updateSystemSchemeHint);
window.addEventListener('storage', (e) => {
  if (e.key === 'color-scheme') applyScheme(getStoredScheme(), false);
});

// --- Dialogs (modern-web-guidance: dialog & light-dismiss-a-dialog) ---
function setupDialogs() {
  const dialogs = [dialogRules, dialogSettings, dialogWin];

  if (!('closedBy' in HTMLDialogElement.prototype)) {
    const outside = (e, dialog) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    for (const dialog of dialogs) {
      if (dialog.getAttribute('closedby') !== 'any') continue;
      let pressedOutside = false;
      dialog.addEventListener('pointerdown', (e) => {
        pressedOutside = outside(e, dialog);
      });
      dialog.addEventListener('pointerup', (e) => {
        if (pressedOutside && outside(e, dialog)) dialog.close();
      });
    }
  }

  for (const dialog of dialogs) {
    dialog.addEventListener('close', () => {
      const val = dialog.returnValue;
      dialog.returnValue = '';
      if (dialog === dialogWin && val === 'new') startGame(state.mode);
    });
  }
}

// --- Timer & Toast ---
function formatTime(ms) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

function formatTenths(ms) {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
}

function stopTimer() {
  if (state.timerId !== null) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

function startTimer() {
  stopTimer();
  elTimer.classList.remove('is-urgent');
  if (state.mode === 'zen' || state.mode === 'duel') return;

  state.startTime = Date.now();
  state.elapsedMs = 0;
  state.blitzPenaltyMs = 0;

  if (state.mode === 'blitz') {
    elTimer.textContent = '60.0s';
    state.timerId = setInterval(() => {
      if (state.finished) return;
      const remain = BLITZ_DURATION_MS - (Date.now() - state.startTime + state.blitzPenaltyMs);
      elTimer.textContent = formatTenths(remain);
      elTimer.classList.toggle('is-urgent', remain <= 10_000);
      if (remain <= 0) {
        elTimer.textContent = '0.0s';
        finishGame();
      }
    }, 100);
  } else {
    elTimer.textContent = '00:00';
    state.timerId = setInterval(() => {
      if (state.finished) return;
      state.elapsedMs = Date.now() - state.startTime;
      elTimer.textContent = formatTime(state.elapsedMs);
    }, 200);
  }
}

function showToast(msg, tone = 'neutral', durationMs = 1350) {
  elStatusText.textContent = msg;
  elStatus.dataset.tone = tone;
  elStatus.dataset.visible = 'true';
  if (state.toastTimerId !== null) clearTimeout(state.toastTimerId);
  state.toastTimerId = setTimeout(() => {
    elStatus.dataset.visible = 'false';
  }, durationMs);
}

// --- Rendering ---
function buildItemTray(container, onPick) {
  container.innerHTML = '';
  for (const item of ITEMS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'item-btn';
    btn.dataset.itemId = String(item.id);
    btn.setAttribute('aria-label', `${item.colorName} ${item.name}`);
    btn.innerHTML = `${renderItemSvg(item.id, item.id)}<span class="item-label">${item.name}</span>`;
    btn.addEventListener('click', () => onPick(item.id, btn));
    container.appendChild(btn);
  }
}

function renderCardInto(container, card, animate = true) {
  container.classList.remove('is-good', 'is-bad', 'is-entering');
  if (animate) {
    void container.offsetWidth;
    container.classList.add('is-entering');
  }
  const [d0, d1] = card.drawings;
  const tilt0 = Math.round((Math.random() - 0.5) * 22);
  const tilt1 = Math.round((Math.random() - 0.5) * 22);
  const dy0 = Math.round((Math.random() - 0.5) * 26);
  const dy1 = Math.round((Math.random() - 0.5) * 26);

  container.setAttribute(
    'aria-label',
    `Card showing ${ITEMS[d0.colorId].colorName} ${ITEMS[d0.shapeId].name} and ${ITEMS[d1.colorId].colorName} ${ITEMS[d1.shapeId].name}`
  );
  container.innerHTML = `
    <div class="card-art" style="--tilt:${tilt0}deg;--dy:${dy0}px">${renderItemSvg(d0.shapeId, d0.colorId)}</div>
    <div class="card-art" style="--tilt:${tilt1}deg;--dy:${dy1}px">${renderItemSvg(d1.shapeId, d1.colorId)}</div>
  `;
}

function clearTrayHighlights(container) {
  container.querySelectorAll('.item-btn').forEach((b) => {
    b.classList.remove('is-correct', 'is-wrong', 'is-hint');
  });
}

// --- Game Flow ---
function startGame(mode = state.mode) {
  state.mode = mode;
  state.deck = generateDeck();
  state.currentCard = state.deck.pop();
  state.matches = 0;
  state.mistakes = 0;
  state.streak = 0;
  state.maxStreak = 0;
  state.score = 0;
  state.duelScoreP1 = 0;
  state.duelScoreP2 = 0;
  state.duelLockP1 = false;
  state.duelLockP2 = false;
  state.locked = false;
  state.finished = false;
  elStatus.dataset.visible = 'false';

  elModeLabel.textContent = MODE_LABELS[mode];
  for (const btn of document.querySelectorAll('.seg-btn[data-mode]')) {
    btn.setAttribute('aria-checked', String(btn.dataset.mode === mode));
  }

  const isDuel = mode === 'duel';
  elSoloStage.hidden = isDuel;
  elDuelStage.hidden = !isDuel;
  elHudStats.hidden = isDuel;
  elBtnHint.hidden = isDuel || mode === 'blitz';

  if (isDuel) {
    stopTimer();
    elDuelTrayP1.classList.remove('is-locked');
    elDuelTrayP2.classList.remove('is-locked');
    elDuelFeedback.textContent = 'Grab the right item!';
    updateDuelHud();
    renderCardInto(elDuelCard, state.currentCard, true);
    return;
  }

  elTimerWrap.hidden = mode === 'zen';
  elStreakWrap.hidden = mode === 'zen';
  elScoreLabel.textContent = mode === 'sprint' ? 'left' : mode === 'blitz' ? 'pts' : 'found';

  clearTrayHighlights(elSoloTray);
  updateSoloHud();
  renderCardInto(elSoloCard, state.currentCard, true);
  startTimer();
}

function updateSoloHud() {
  if (state.mode === 'sprint') {
    elScore.textContent = String(state.deck.length + 1);
  } else if (state.mode === 'blitz') {
    elScore.textContent = String(state.score);
  } else {
    elScore.textContent = String(state.matches);
  }
  elStreak.textContent = String(state.streak);
}

function updateDuelHud() {
  elDuelScoreP1.textContent = `P1 · ${state.duelScoreP1}`;
  elDuelScoreP2.textContent = `P2 · ${state.duelScoreP2}`;
  elDuelDeckLeft.textContent = `${state.deck.length + 1} left`;
}

function handleSoloPick(itemId, btn) {
  if (state.locked || state.finished) return;
  const card = state.currentCard;

  if (itemId !== card.answerId) {
    state.mistakes++;
    state.streak = 0;
    playTone('wrong');
    btn.classList.remove('is-wrong');
    void btn.offsetWidth;
    btn.classList.add('is-wrong');
    elSoloCard.classList.remove('is-bad');
    void elSoloCard.offsetWidth;
    elSoloCard.classList.add('is-bad');

    const correct = ITEMS[card.answerId];
    if (state.mode === 'blitz') {
      state.blitzPenaltyMs += 2000;
      showToast(`Wrong (−2s) · Look for ${card.type === 'exact' ? 'exact match' : 'missing shape & color'}`, 'bad', 1400);
    } else if (state.mode === 'zen') {
      showToast(`Not ${ITEMS[itemId].name} — ${card.reason}`, 'bad', 2200);
    } else {
      showToast(`Not ${ITEMS[itemId].name}!`, 'bad', 950);
    }
    updateSoloHud();
    return;
  }

  // Correct grab!
  state.locked = true;
  state.matches++;
  state.streak++;
  if (state.streak > state.maxStreak) state.maxStreak = state.streak;

  const mult = Math.min(5, 1 + Math.floor((state.streak - 1) / 3));
  const pts = 100 * mult;
  state.score += pts;

  state.records.totalMatches++;
  if (state.streak > state.records.bestStreak) state.records.bestStreak = state.streak;
  saveJson(STORAGE_RECORDS, state.records);

  playTone('match', state.streak);
  btn.classList.add('is-correct');
  elSoloCard.classList.add('is-good');

  const item = ITEMS[card.answerId];
  const tag = card.type === 'exact' ? 'Exact' : 'Absent';
  const msg =
    state.mode === 'blitz'
      ? `${item.name}! +${pts}${mult > 1 ? ` (${mult}×)` : ''}`
      : `${item.colorName} ${item.name}! (${tag})`;
  showToast(msg, 'good', 900);
  updateSoloHud();

  setTimeout(() => {
    if (state.finished) return;
    if (state.deck.length === 0) {
      if (state.mode === 'sprint') {
        state.locked = false;
        finishGame();
        return;
      }
      state.deck = generateDeck();
    }
    state.currentCard = state.deck.pop();
    state.locked = false;
    clearTrayHighlights(elSoloTray);
    updateSoloHud();
    renderCardInto(elSoloCard, state.currentCard, true);
  }, 240);
}

function handleDuelPick(player, itemId, btn) {
  if (state.locked || state.finished) return;
  if (player === 1 && state.duelLockP1) return;
  if (player === 2 && state.duelLockP2) return;

  const card = state.currentCard;
  const tray = player === 1 ? elDuelTrayP1 : elDuelTrayP2;

  if (itemId !== card.answerId) {
    playTone('wrong');
    btn.classList.add('is-wrong');
    tray.classList.add('is-locked');
    if (player === 1) state.duelLockP1 = true;
    else state.duelLockP2 = true;
    setTimeout(() => {
      if (player === 1) state.duelLockP1 = false;
      else state.duelLockP2 = false;
      tray.classList.remove('is-locked');
      btn.classList.remove('is-wrong');
    }, 700);
    return;
  }

  state.locked = true;
  if (player === 1) state.duelScoreP1++;
  else state.duelScoreP2++;
  playTone('match', 3);

  btn.classList.add('is-correct');
  elDuelCard.classList.add('is-good');
  elDuelFeedback.textContent = `P${player}: ${ITEMS[card.answerId].name}!`;
  updateDuelHud();

  setTimeout(() => {
    if (state.deck.length === 0) {
      state.locked = false;
      finishGame();
      return;
    }
    state.currentCard = state.deck.pop();
    state.locked = false;
    clearTrayHighlights(elDuelTrayP1);
    clearTrayHighlights(elDuelTrayP2);
    updateDuelHud();
    renderCardInto(elDuelCard, state.currentCard, true);
  }, 260);
}

function handleHint() {
  if (state.locked || state.finished || state.mode === 'duel' || state.mode === 'blitz') return;
  const card = state.currentCard;
  state.streak = 0;
  playTone('hint');
  clearTrayHighlights(elSoloTray);
  const target = elSoloTray.querySelector(`.item-btn[data-item-id="${card.answerId}"]`);
  if (target) target.classList.add('is-hint');
  showToast(card.reason, 'hint', 2200);
  updateSoloHud();
}

function finishGame() {
  state.finished = true;
  stopTimer();
  playTone('win');

  const winTitle = document.getElementById('win-title');
  const winSub = document.getElementById('win-subtitle');
  const winStats = document.getElementById('win-stats');

  if (state.mode === 'duel') {
    const p1 = state.duelScoreP1;
    const p2 = state.duelScoreP2;
    winTitle.textContent = p1 === p2 ? "It's a Tie!" : p1 > p2 ? 'Player 1 Wins!' : 'Player 2 Wins!';
    winSub.textContent = '60-card Ghost Blitz duel complete.';
    winStats.innerHTML = `
      <div class="record-card"><div class="record-label">Player 1</div><div class="record-value">${p1}</div></div>
      <div class="record-card"><div class="record-label">Player 2</div><div class="record-value">${p2}</div></div>
    `;
    dialogWin.showModal();
    return;
  }

  let isRecord = false;
  if (state.mode === 'sprint') {
    state.elapsedMs = Date.now() - state.startTime;
    elTimer.textContent = formatTime(state.elapsedMs);
    if (state.records.sprintBestMs === null || state.elapsedMs < state.records.sprintBestMs) {
      state.records.sprintBestMs = state.elapsedMs;
      isRecord = true;
      saveJson(STORAGE_RECORDS, state.records);
    }
    const avg = (state.elapsedMs / Math.max(1, state.matches) / 1000).toFixed(2);
    winTitle.textContent = isRecord ? 'New Best Sprint!' : 'Deck Cleared!';
    winSub.textContent = 'All 60 Ghost Blitz cards solved.';
    winStats.innerHTML = `
      <div class="record-card"><div class="record-label">Time</div><div class="record-value">${formatTime(state.elapsedMs)}</div></div>
      <div class="record-card"><div class="record-label">Avg / Card</div><div class="record-value">${avg}s</div></div>
      <div class="record-card"><div class="record-label">Best Streak</div><div class="record-value">${state.maxStreak}</div></div>
      <div class="record-card"><div class="record-label">Mistakes</div><div class="record-value">${state.mistakes}</div></div>
    `;
  } else if (state.mode === 'blitz') {
    if (state.score > state.records.blitzBestScore) {
      state.records.blitzBestScore = state.score;
      isRecord = true;
      saveJson(STORAGE_RECORDS, state.records);
    }
    winTitle.textContent = isRecord ? 'New High Score!' : "Time's Up!";
    winSub.textContent = '60-Second Ghost Blitz.';
    winStats.innerHTML = `
      <div class="record-card"><div class="record-label">Score</div><div class="record-value">${state.score}</div></div>
      <div class="record-card"><div class="record-label">Matches</div><div class="record-value">${state.matches}</div></div>
      <div class="record-card"><div class="record-label">Best Streak</div><div class="record-value">${state.maxStreak}</div></div>
      <div class="record-card"><div class="record-label">Mistakes</div><div class="record-value">${state.mistakes}</div></div>
    `;
  }
  dialogWin.showModal();
}

function renderRecords() {
  const best = state.records.sprintBestMs !== null ? formatTime(state.records.sprintBestMs) : '—';
  elRecordsGrid.innerHTML = `
    <div class="record-card"><div class="record-label">Best Sprint</div><div class="record-value">${best}</div></div>
    <div class="record-card"><div class="record-label">Best 60s</div><div class="record-value">${state.records.blitzBestScore}</div></div>
    <div class="record-card"><div class="record-label">Best Streak</div><div class="record-value">${state.records.bestStreak}</div></div>
    <div class="record-card"><div class="record-label">Total Grabs</div><div class="record-value">${state.records.totalMatches}</div></div>
  `;
}

function applySettingsToDom() {
  optLabels.checked = state.settings.labels;
  optSound.checked = state.settings.sound;
  elShell.classList.toggle('hide-labels', !state.settings.labels);
}

function openSettings() {
  renderRecords();
  updateSystemSchemeHint();
  dialogSettings.showModal();
}

// --- Wiring ---
elModeTrigger.addEventListener('click', openSettings);
elBtnSettings.addEventListener('click', openSettings);
elBtnRules.addEventListener('click', () => dialogRules.showModal());
elBtnHint.addEventListener('click', handleHint);
elBtnNew.addEventListener('click', () => startGame(state.mode));

document.querySelectorAll('.seg-btn[data-mode]').forEach((btn) => {
  btn.addEventListener('click', () => startGame(btn.dataset.mode));
});

document.querySelectorAll('.seg-btn[data-scheme]').forEach((btn) => {
  btn.addEventListener('click', () => applyScheme(btn.dataset.scheme, true));
});

optLabels.addEventListener('change', () => {
  state.settings.labels = optLabels.checked;
  saveJson(STORAGE_SETTINGS, state.settings);
  applySettingsToDom();
});

optSound.addEventListener('change', () => {
  state.settings.sound = optSound.checked;
  saveJson(STORAGE_SETTINGS, state.settings);
});

// Keyboard shortcuts 1-5 for desktop play
window.addEventListener('keydown', (e) => {
  if (dialogRules.open || dialogSettings.open || dialogWin.open) return;
  if (state.mode === 'duel' || e.metaKey || e.ctrlKey || e.altKey) return;
  const n = Number(e.key);
  if (n >= 1 && n <= 5) {
    const btn = elSoloTray.querySelector(`.item-btn[data-item-id="${n - 1}"]`);
    if (btn) handleSoloPick(n - 1, btn);
  } else if (e.key.toLowerCase() === 'h') {
    handleHint();
  }
});

// Service Worker (skip inside offline Android APK host)
if (
  'serviceWorker' in navigator &&
  location.hostname !== 'appassets.androidplatform.net'
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// Boot
buildItemTray(elSoloTray, handleSoloPick);
buildItemTray(elDuelTrayP1, (id, btn) => handleDuelPick(1, id, btn));
buildItemTray(elDuelTrayP2, (id, btn) => handleDuelPick(2, id, btn));
setupDialogs();
applyScheme(getStoredScheme(), false);
applySettingsToDom();
startGame('sprint');

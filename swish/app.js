import {
  COLORS,
  COLS,
  ORIENTATIONS,
  ROWS,
  cardAriaLabel,
  findAnySwish,
  generateDeck,
  shuffle,
  solveSwish,
} from './engine.js';

const STORAGE_SETTINGS = 'swish-settings-v1';
const STORAGE_RECORDS = 'swish-records-v1';
const BLITZ_DURATION_MS = 60_000;

const MODE_LABELS = {
  classic: 'Classic',
  blitz: '60s',
  zen: 'Zen',
};

const defaultSettings = {
  dots: true,
  sound: true,
};

const defaultRecords = {
  classicBestMs: null,
  blitzBestScore: 0,
  totalSwishes: 0,
  bestCombo: 0,
};

const state = {
  mode: 'classic',
  deck: [],
  board: [], // 16 slots (card or null)
  selected: [], // board indices
  hintIndices: [],
  swishes: 0,
  cardsCleared: 0,
  score: 0,
  hintsUsed: 0,
  startTime: null,
  elapsedMs: 0,
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
const elTimerWrap = document.getElementById('stat-timer-wrap');
const elTimer = document.getElementById('stat-timer');
const elScore = document.getElementById('stat-score');
const elScoreLabel = document.getElementById('stat-score-label');
const elDeckWrap = document.getElementById('stat-deck-wrap');
const elDeck = document.getElementById('stat-deck');
const elGrid = document.getElementById('swish-grid');
const elStatus = document.getElementById('status-banner');
const elStatusText = document.getElementById('status-text');
const elStackOverlay = document.getElementById('stack-overlay');
const elStackPreview = document.getElementById('stack-preview');
const elStackCaption = document.getElementById('stack-caption');

const elBtnClear = document.getElementById('btn-clear');
const elBtnHint = document.getElementById('btn-hint');
const elBtnNew = document.getElementById('btn-new');
const elBtnRules = document.getElementById('btn-rules');
const elBtnSettings = document.getElementById('btn-settings');

const dialogRules = document.getElementById('dialog-rules');
const dialogSettings = document.getElementById('dialog-settings');
const dialogWin = document.getElementById('dialog-win');
const optDots = document.getElementById('opt-dots');
const optSound = document.getElementById('opt-sound');
const elSchemeHint = document.getElementById('scheme-system-hint');
const elRecordsGrid = document.getElementById('records-grid');

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

function playTone(type) {
  if (!state.settings.sound) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const tone = (freq, start, dur, peak, wave = 'sine') => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = wave;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    };
    if (type === 'tap') {
      tone(520, now, 0.05, 0.05, 'triangle');
    } else if (type === 'swish') {
      tone(523.25, now, 0.14, 0.08);
      tone(659.25, now + 0.06, 0.16, 0.08);
      tone(880, now + 0.12, 0.24, 0.09);
    } else if (type === 'hint') {
      tone(440, now, 0.11, 0.05);
    } else if (type === 'win') {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        tone(f, now + i * 0.085, 0.26, 0.09)
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
      dialog.addEventListener('pointerdown', (e) => { pressedOutside = outside(e, dialog); });
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

// --- SVG Transparent Card Renderer (3x4 grid inside viewBox="0 0 90 120") ---
function cellCenter(col, row) {
  return { cx: 15 + col * 30, cy: 15 + row * 30 };
}

function buildGridDotsSvg() {
  let out = '';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const { cx, cy } = cellCenter(c, r);
      out += `<circle class="grid-dot" cx="${cx}" cy="${cy}" r="2.2" fill="var(--dot-color)"/>`;
    }
  }
  return out;
}

const GRID_DOTS_SVG = buildGridDotsSvg();

function renderSwishCardSvg(card) {
  const b = cellCenter(card.ball.col, card.ball.row);
  const h = cellCenter(card.hoop.col, card.hoop.row);
  const bCol = COLORS[card.ball.color];
  const hCol = COLORS[card.hoop.color];

  return `<svg viewBox="0 0 90 120" aria-hidden="true">
    ${GRID_DOTS_SVG}
    <circle cx="${h.cx}" cy="${h.cy}" r="11.5" fill="none" stroke="${hCol.hex}" stroke-width="4.2"/>
    <circle cx="${b.cx}" cy="${b.cy}" r="7.2" fill="${bCol.hex}" stroke="${bCol.stroke}" stroke-width="1.2"/>
    <circle cx="${b.cx - 2.2}" cy="${b.cy - 2.2}" r="2" fill="rgba(255,255,255,0.45)"/>
  </svg>`;
}

function renderStackedSolutionSvg(stacked) {
  let hoops = '';
  let balls = '';
  for (const t of stacked) {
    const h = cellCenter(t.hoop.col, t.hoop.row);
    const b = cellCenter(t.ball.col, t.ball.row);
    const hCol = COLORS[t.hoop.color];
    const bCol = COLORS[t.ball.color];
    hoops += `<circle cx="${h.cx}" cy="${h.cy}" r="12" fill="none" stroke="${hCol.hex}" stroke-width="4.4"/>`;
    balls += `<circle cx="${b.cx}" cy="${b.cy}" r="7.2" fill="${bCol.hex}" stroke="${bCol.stroke}" stroke-width="1.2"/>
              <circle cx="${b.cx - 2.2}" cy="${b.cy - 2.2}" r="2" fill="rgba(255,255,255,0.45)"/>`;
  }
  return `<svg viewBox="0 0 90 120" aria-hidden="true">${GRID_DOTS_SVG}${hoops}${balls}</svg>`;
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
  if (state.mode === 'zen') return;

  state.startTime = Date.now();
  state.elapsedMs = 0;

  if (state.mode === 'blitz') {
    elTimer.textContent = '60.0s';
    state.timerId = setInterval(() => {
      if (state.finished) return;
      const remain = BLITZ_DURATION_MS - (Date.now() - state.startTime);
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

function showToast(msg, tone = 'neutral', ms = 1200) {
  elStatusText.textContent = msg;
  elStatus.dataset.tone = tone;
  elStatus.dataset.visible = 'true';
  if (state.toastTimerId !== null) clearTimeout(state.toastTimerId);
  state.toastTimerId = setTimeout(() => {
    elStatus.dataset.visible = 'false';
  }, ms);
}

// --- Game Lifecycle ---
function ensurePlayableBoard() {
  const active = state.board.filter(Boolean);
  if (findAnySwish(active)) return true;

  // Try swapping in cards from deck until a Swish exists
  let tries = 0;
  while (!findAnySwish(state.board.filter(Boolean)) && state.deck.length > 0 && tries < 25) {
    const replaceIdx = Math.floor(Math.random() * state.board.length);
    if (state.board[replaceIdx]) {
      state.deck.unshift(state.board[replaceIdx]);
      state.board[replaceIdx] = state.deck.pop();
    }
    tries++;
  }
  return findAnySwish(state.board.filter(Boolean)) !== null;
}

function startGame(mode = state.mode) {
  stopTimer();
  state.mode = mode;
  state.selected = [];
  state.hintIndices = [];
  state.swishes = 0;
  state.cardsCleared = 0;
  state.score = 0;
  state.hintsUsed = 0;
  state.locked = false;
  state.finished = false;
  elStatus.dataset.visible = 'false';
  elStackOverlay.hidden = true;

  const fullDeck = generateDeck();
  state.board = fullDeck.slice(0, 16);
  state.deck = fullDeck.slice(16);
  ensurePlayableBoard();

  elModeLabel.textContent = MODE_LABELS[mode];
  for (const btn of document.querySelectorAll('.seg-btn[data-mode]')) {
    btn.setAttribute('aria-checked', String(btn.dataset.mode === mode));
  }

  elTimerWrap.hidden = mode === 'zen';
  elDeckWrap.hidden = mode !== 'classic';
  elBtnHint.hidden = mode === 'blitz';
  elScoreLabel.textContent = mode === 'blitz' ? 'pts' : 'swishes';

  renderAll(true);
  startTimer();
}

function handleCardTap(index) {
  if (state.locked || state.finished || !state.board[index]) return;

  const pos = state.selected.indexOf(index);
  if (pos !== -1) {
    state.selected.splice(pos, 1);
    playTone('tap');
    updateSelectionUi();
    return;
  }

  if (state.selected.length >= 4) {
    state.selected.shift();
  }
  state.selected.push(index);
  playTone('tap');
  updateSelectionUi();

  // Check if selected 2..4 cards form a valid Swish!
  if (state.selected.length >= 2) {
    const pickedCards = state.selected.map((i) => state.board[i]);
    const solution = solveSwish(pickedCards);
    if (solution) {
      celebrateSwish(state.selected.slice(), solution);
    }
  }
}

function celebrateSwish(indices, solution) {
  state.locked = true;
  state.hintIndices = [];
  const count = indices.length;
  state.swishes++;
  state.cardsCleared += count;
  state.score += count * 100;

  state.records.totalSwishes++;
  if (count > state.records.bestCombo) state.records.bestCombo = count;
  saveJson(STORAGE_RECORDS, state.records);

  playTone('swish');

  // Show the translucent stacked-card proof!
  const orientNotes = solution.orientations
    .slice(1)
    .map((o) => ORIENTATIONS[o].label)
    .join(' · ');
  elStackPreview.innerHTML = renderStackedSolutionSvg(solution.stacked);
  elStackCaption.textContent = `${count}-Card Swish! (${orientNotes})`;
  elStackOverlay.hidden = false;

  setTimeout(() => {
    elStackOverlay.hidden = true;
    const used = indices.map((i) => state.board[i]);

    if (state.mode === 'zen' || state.mode === 'blitz') {
      state.deck.unshift(...shuffle(used));
    }

    for (const idx of indices) {
      state.board[idx] = state.deck.length > 0 ? state.deck.pop() : null;
    }

    state.selected = [];
    state.locked = false;

    const playable = ensurePlayableBoard();
    renderAll(false);

    if (!playable && state.mode === 'classic') {
      finishGame();
    }
  }, 950);
}

function handleHint() {
  if (state.locked || state.finished || state.mode === 'blitz') return;
  const activeIndices = [];
  const activeCards = [];
  state.board.forEach((c, idx) => {
    if (c) {
      activeIndices.push(idx);
      activeCards.push(c);
    }
  });
  const found = findAnySwish(activeCards);
  if (!found) {
    if (state.mode === 'classic') finishGame();
    return;
  }

  state.hintsUsed++;
  const boardIdxs = found.indices.map((k) => activeIndices[k]);
  state.hintIndices = boardIdxs;
  playTone('hint');
  showToast(`Hint: ${boardIdxs.length}-card Swish highlighted!`, 'hint', 1800);
  updateSelectionUi();
}

function finishGame() {
  state.finished = true;
  stopTimer();
  playTone('win');

  const winTitle = document.getElementById('win-title');
  const winSub = document.getElementById('win-subtitle');
  const winStats = document.getElementById('win-stats');

  let isRecord = false;
  if (state.mode === 'classic') {
    state.elapsedMs = Date.now() - state.startTime;
    elTimer.textContent = formatTime(state.elapsedMs);
    if (state.records.classicBestMs === null || state.elapsedMs < state.records.classicBestMs) {
      state.records.classicBestMs = state.elapsedMs;
      isRecord = true;
      saveJson(STORAGE_RECORDS, state.records);
    }
    winTitle.textContent = isRecord ? 'New Best Time!' : 'Deck Complete!';
    winSub.textContent = 'No more Swishes remain on the board.';
    winStats.innerHTML = `
      <div class="record-card"><div class="record-label">Time</div><div class="record-value">${formatTime(state.elapsedMs)}</div></div>
      <div class="record-card"><div class="record-label">Swishes</div><div class="record-value">${state.swishes}</div></div>
      <div class="record-card"><div class="record-label">Cards Cleared</div><div class="record-value">${state.cardsCleared}</div></div>
      <div class="record-card"><div class="record-label">Hints Used</div><div class="record-value">${state.hintsUsed}</div></div>
    `;
  } else if (state.mode === 'blitz') {
    if (state.score > state.records.blitzBestScore) {
      state.records.blitzBestScore = state.score;
      isRecord = true;
      saveJson(STORAGE_RECORDS, state.records);
    }
    winTitle.textContent = isRecord ? 'New High Score!' : "Time's Up!";
    winSub.textContent = '60-Second Swish Blitz.';
    winStats.innerHTML = `
      <div class="record-card"><div class="record-label">Score</div><div class="record-value">${state.score}</div></div>
      <div class="record-card"><div class="record-label">Swishes</div><div class="record-value">${state.swishes}</div></div>
      <div class="record-card"><div class="record-label">Cards Cleared</div><div class="record-value">${state.cardsCleared}</div></div>
      <div class="record-card"><div class="record-label">Best Combo</div><div class="record-value">${state.records.bestCombo}</div></div>
    `;
  }
  dialogWin.showModal();
}

// --- Rendering ---
function updateHud() {
  elScore.textContent = String(state.mode === 'blitz' ? state.score : state.swishes);
  elDeck.textContent = String(state.deck.length);
  elBtnClear.hidden = state.selected.length === 0;
}

function updateSelectionUi() {
  const buttons = elGrid.children;
  for (let i = 0; i < buttons.length; i++) {
    buttons[i].setAttribute('aria-pressed', String(state.selected.includes(i)));
    buttons[i].classList.toggle('is-hint', state.hintIndices.includes(i));
  }
  updateHud();
}

function renderAll(animateEnter = false) {
  elGrid.innerHTML = '';
  state.board.forEach((card, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'swish-card' + (animateEnter ? ' is-entering' : '');
    if (!card) {
      btn.classList.add('is-empty');
      btn.disabled = true;
    } else {
      btn.innerHTML = renderSwishCardSvg(card);
      btn.setAttribute('aria-label', cardAriaLabel(card));
      btn.setAttribute('aria-pressed', String(state.selected.includes(idx)));
      if (state.hintIndices.includes(idx)) btn.classList.add('is-hint');
      btn.addEventListener('click', () => handleCardTap(idx));
    }
    elGrid.appendChild(btn);
  });
  updateHud();
}

function renderRecords() {
  const best = state.records.classicBestMs !== null ? formatTime(state.records.classicBestMs) : '—';
  elRecordsGrid.innerHTML = `
    <div class="record-card"><div class="record-label">Best Classic</div><div class="record-value">${best}</div></div>
    <div class="record-card"><div class="record-label">Best 60s</div><div class="record-value">${state.records.blitzBestScore}</div></div>
    <div class="record-card"><div class="record-label">Total Swishes</div><div class="record-value">${state.records.totalSwishes}</div></div>
    <div class="record-card"><div class="record-label">Biggest Combo</div><div class="record-value">${state.records.bestCombo || '—'}</div></div>
  `;
}

function applySettingsToDom() {
  optDots.checked = state.settings.dots;
  optSound.checked = state.settings.sound;
  elShell.classList.toggle('hide-dots', !state.settings.dots);
}

function openSettings() {
  renderRecords();
  updateSystemSchemeHint();
  dialogSettings.showModal();
}

// --- Event Wiring ---
elModeTrigger.addEventListener('click', openSettings);
elBtnSettings.addEventListener('click', openSettings);
elBtnRules.addEventListener('click', () => dialogRules.showModal());
elBtnHint.addEventListener('click', handleHint);
elBtnNew.addEventListener('click', () => startGame(state.mode));
elBtnClear.addEventListener('click', () => {
  state.selected = [];
  updateSelectionUi();
});

document.querySelectorAll('.seg-btn[data-mode]').forEach((btn) => {
  btn.addEventListener('click', () => startGame(btn.dataset.mode));
});

document.querySelectorAll('.seg-btn[data-scheme]').forEach((btn) => {
  btn.addEventListener('click', () => applyScheme(btn.dataset.scheme, true));
});

optDots.addEventListener('change', () => {
  state.settings.dots = optDots.checked;
  saveJson(STORAGE_SETTINGS, state.settings);
  applySettingsToDom();
});

optSound.addEventListener('change', () => {
  state.settings.sound = optSound.checked;
  saveJson(STORAGE_SETTINGS, state.settings);
});

window.addEventListener('keydown', (e) => {
  if (dialogRules.open || dialogSettings.open || dialogWin.open) return;
  if (e.key === 'Escape') {
    state.selected = [];
    updateSelectionUi();
  } else if (e.key.toLowerCase() === 'h') {
    handleHint();
  }
});

if ('serviceWorker' in navigator && location.hostname !== 'appassets.androidplatform.net') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// Boot
setupDialogs();
applyScheme(getStoredScheme(), false);
applySettingsToDom();
startGame('classic');

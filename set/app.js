import {
  cardAriaLabel,
  createDeck,
  explainMismatch,
  findAllSets,
  generateDailyBoard,
  getTodayKey,
  isValidSet,
  setKey,
  shuffle,
} from './engine.js';

const STORAGE_SETTINGS = 'set-solitaire-settings-v2';
const STORAGE_RECORDS = 'set-solitaire-records-v1';

// Classic crisp vector shapes inside viewBox="0 0 60 120"
const SHAPE_PATHS = {
  // 0: Diamond
  0: 'M 30 7 L 54 60 L 30 113 L 6 60 Z',
  // 1: Squiggle (smooth classic S-curve)
  1: 'M 19 10 C 38 4 54 19 48 39 C 44 52 38 56 44 72 C 51 90 45 114 25 113 C 10 112 6 95 13 78 C 19 64 21 57 14 43 C 7 29 7 14 19 10 Z',
  // 2: Oval (pill / stadium)
  2: 'M 30 8 C 46 8 52 20 52 36 L 52 84 C 52 100 46 112 30 112 C 14 112 8 100 8 84 L 8 36 C 8 20 14 8 30 8 Z',
};

const defaultSettings = {
  colorblind: false,
  autoDeal: true,
  showCount: false,
  sound: true,
};

const defaultRecords = {
  classicBestMs: null,
  classicCleared: 0,
  dailySolvedDates: [],
  zenTotalSets: 0,
};

const state = {
  mode: 'classic', // 'classic' | 'daily' | 'zen'
  deck: [],
  board: [],
  selected: [], // board indices
  hintIndices: [],
  setsFound: 0,
  mistakes: 0,
  hintsUsed: 0,
  startTime: null,
  elapsedMs: 0,
  timerId: null,
  locked: false,
  finished: false,
  // Daily mode specifics
  dailyDateKey: '',
  dailyTarget: 6,
  dailyFoundKeys: new Set(),
  dailyFoundCards: [],
  settings: loadJson(STORAGE_SETTINGS, defaultSettings),
  records: loadJson(STORAGE_RECORDS, defaultRecords),
};

// DOM references
const elGrid = document.getElementById('card-grid');
const elStatus = document.getElementById('status-banner');
const elStatusText = document.getElementById('status-text');
const elTimer = document.getElementById('stat-timer');
const elTimerWrap = document.getElementById('stat-timer-wrap');
const elSets = document.getElementById('stat-sets');
const elSetsLabel = document.getElementById('stat-sets-label');
const elDeck = document.getElementById('stat-deck');
const elDeckWrap = document.getElementById('stat-deck-wrap');
const elDailyTray = document.getElementById('daily-tray');
const elDailyTitle = document.getElementById('daily-title');
const elDailyProgress = document.getElementById('daily-progress');
const elDailySlots = document.getElementById('daily-slots');
const elBtnHint = document.getElementById('btn-hint');
const elBtnDeal = document.getElementById('btn-deal');
const elBtnDealLabel = document.getElementById('btn-deal-label');
const elBtnShuffle = document.getElementById('btn-shuffle');
const elBtnNew = document.getElementById('btn-new');
const elBtnRules = document.getElementById('btn-rules');
const elBtnSettings = document.getElementById('btn-settings');

const dialogRules = document.getElementById('dialog-rules');
const dialogSettings = document.getElementById('dialog-settings');
const dialogWin = document.getElementById('dialog-win');

const optColorblind = document.getElementById('opt-colorblind');
const optAutoDeal = document.getElementById('opt-autodeal');
const optShowCount = document.getElementById('opt-showcount');
const optSound = document.getElementById('opt-sound');
const elSchemeHint = document.getElementById('scheme-system-hint');
const elRecordsGrid = document.getElementById('records-grid');

// --- Storage Helpers ---
function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ...fallback };
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return { ...fallback };
  }
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

// --- Synthesized Web Audio (Zero External Assets) ---
let audioCtx = null;

function playTone(type) {
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
      gain.gain.exponentialRampToValueAtTime(gainPeak, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    };

    if (type === 'tap') {
      tone(520, now, 0.05, 0.05, 'triangle');
    } else if (type === 'match') {
      tone(523.25, now, 0.14, 0.08);
      tone(659.25, now + 0.07, 0.16, 0.08);
      tone(783.99, now + 0.14, 0.22, 0.09);
    } else if (type === 'mismatch') {
      tone(220, now, 0.12, 0.07, 'sawtooth');
      tone(185, now + 0.09, 0.16, 0.06, 'sawtooth');
    } else if (type === 'win') {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, idx) =>
        tone(f, now + idx * 0.09, 0.28, 0.09)
      );
    }
  } catch {}
}

// --- SVG Symbol Rendering ---
function buildSymbolSvg(card) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 60 120');
  svg.setAttribute('aria-hidden', 'true');

  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', SHAPE_PATHS[card.shape]);
  const colorVar = `var(--card-c${card.color})`;
  path.setAttribute('stroke', colorVar);
  path.setAttribute('stroke-width', '5.5');
  path.setAttribute('stroke-linejoin', 'round');

  if (card.shading === 0) {
    path.setAttribute('fill', colorVar);
  } else if (card.shading === 1) {
    path.setAttribute('fill', `url(#stripe-${card.color})`);
  } else {
    path.setAttribute('fill', 'none');
  }

  svg.appendChild(path);
  return svg;
}

function populateSymbols(container, card) {
  const count = card.count + 1;
  for (let i = 0; i < count; i++) {
    container.appendChild(buildSymbolSvg(card));
  }
}

// --- Color Scheme Management (modern-web-guidance: dark-mode-toggle) ---
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

function applyScheme(choice, persist = true) {
  const metaContent = choice === 'system' ? 'light dark' : choice;
  metaColorScheme.content = metaContent;

  if (persist) {
    try {
      if (choice === 'system') {
        localStorage.removeItem('color-scheme');
      } else {
        localStorage.setItem('color-scheme', choice);
      }
    } catch {}
  }

  for (const btn of document.querySelectorAll('.seg-btn[data-scheme]')) {
    btn.setAttribute('aria-checked', String(btn.dataset.scheme === choice));
  }
  updateSystemSchemeHint();
}

function updateSystemSchemeHint() {
  const choice = getStoredScheme();
  const current = systemDarkQuery.matches ? 'dark' : 'light';
  if (choice === 'system') {
    elSchemeHint.textContent = `System (currently ${current})`;
  } else {
    elSchemeHint.textContent = `Pinned to ${choice} (system is ${current})`;
  }
}

systemDarkQuery.addEventListener('change', updateSystemSchemeHint);
window.addEventListener('storage', (e) => {
  if (e.key === 'color-scheme') {
    applyScheme(getStoredScheme(), false);
  }
});

// --- Dialog Light-Dismiss Fallback (modern-web-guidance: dialog & light-dismiss-a-dialog) ---
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
      if (dialog === dialogWin && val === 'new') {
        startGame(state.mode);
      }
    });
  }
}

// --- Timer ---
function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const mins = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const secs = String(totalSec % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

function stopTimer() {
  if (state.timerId !== null) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

function startTimer() {
  stopTimer();
  if (state.mode === 'zen') {
    elTimer.textContent = '∞';
    return;
  }
  state.startTime = Date.now();
  state.elapsedMs = 0;
  elTimer.textContent = '00:00';
  state.timerId = setInterval(() => {
    if (!state.finished) {
      state.elapsedMs = Date.now() - state.startTime;
      elTimer.textContent = formatTime(state.elapsedMs);
    }
  }, 250);
}

// --- Feedback Banner ---
function setStatus(message, tone = 'neutral') {
  elStatusText.textContent = message;
  elStatus.dataset.tone = tone;
}

// --- Core Game Lifecycle ---
function startGame(mode = state.mode) {
  state.mode = mode;
  state.selected = [];
  state.hintIndices = [];
  state.setsFound = 0;
  state.mistakes = 0;
  state.hintsUsed = 0;
  state.locked = false;
  state.finished = false;
  state.dailyFoundKeys = new Set();
  state.dailyFoundCards = [];

  for (const btn of document.querySelectorAll('.mode-pill')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.mode === mode));
  }

  if (mode === 'daily') {
    state.dailyDateKey = getTodayKey();
    const puzzle = generateDailyBoard(state.dailyDateKey, 6);
    state.board = puzzle.board;
    state.deck = [];
    state.dailyTarget = Math.min(6, puzzle.totalSets);
    elDailyTray.hidden = false;
    elDeckWrap.hidden = true;
    elTimerWrap.hidden = false;
    elBtnDeal.hidden = true;
    elSetsLabel.textContent = 'Found';
    elDailyTitle.textContent = `Daily Puzzle · ${state.dailyDateKey}`;
    setStatus(`Find ${state.dailyTarget} unique SETs on today's 12-card board.`);
  } else {
    elDailyTray.hidden = true;
    elBtnDeal.hidden = false;
    elSetsLabel.textContent = 'SETs';
    elDeckWrap.hidden = mode === 'zen';
    elTimerWrap.hidden = mode === 'zen';

    const fullDeck = shuffle(createDeck());
    state.board = fullDeck.slice(0, 12);
    state.deck = fullDeck.slice(12);

    let initialExtra = 0;
    if (state.settings.autoDeal) {
      initialExtra = ensureBoardHasSet();
    }
    if (initialExtra > 0) {
      setStatus(`No SET in initial 12 cards — auto-dealt +${initialExtra} extra cards.`, 'hint');
    } else {
      setStatus(
        mode === 'zen'
          ? 'Relaxed practice — take your time and spot SETs.'
          : 'Clear the 81-card deck as fast as you can!'
      );
    }
  }

  startTimer();
  renderAll(true);
}

function ensureBoardHasSet() {
  let dealt = 0;
  while (findAllSets(state.board).length === 0 && state.deck.length >= 3 && state.board.length < 21) {
    state.board.push(...state.deck.splice(0, 3));
    dealt += 3;
  }
  return dealt;
}

function handleCardTap(index) {
  if (state.locked || state.finished) return;

  const pos = state.selected.indexOf(index);
  if (pos !== -1) {
    state.selected.splice(pos, 1);
    playTone('tap');
    updateCardStates();
    return;
  }

  if (state.selected.length >= 3) return;
  state.selected.push(index);
  playTone('tap');
  updateCardStates();

  if (state.selected.length === 3) {
    evaluateSelection();
  }
}

function evaluateSelection() {
  const [i, j, k] = state.selected;
  const cards = [state.board[i], state.board[j], state.board[k]];

  if (!isValidSet(cards[0], cards[1], cards[2])) {
    state.mistakes++;
    state.locked = true;
    playTone('mismatch');
    const reasons = explainMismatch(cards[0], cards[1], cards[2], state.settings.colorblind);
    setStatus(`Not a SET — ${reasons.join(' · ')}`, 'bad');
    animateCards(state.selected, 'is-mismatch');
    setTimeout(() => {
      state.selected = [];
      state.locked = false;
      updateCardStates();
    }, 420);
    return;
  }

  // Valid SET!
  if (state.mode === 'daily') {
    const key = setKey(cards);
    if (state.dailyFoundKeys.has(key)) {
      state.locked = true;
      playTone('mismatch');
      setStatus('Already found that SET! Look for a different trio.', 'hint');
      animateCards(state.selected, 'is-mismatch');
      setTimeout(() => {
        state.selected = [];
        state.locked = false;
        updateCardStates();
      }, 380);
      return;
    }

    state.dailyFoundKeys.add(key);
    state.dailyFoundCards.push(cards);
    state.setsFound++;
    state.hintIndices = [];
    state.locked = true;
    playTone('match');
    animateCards(state.selected, 'is-match');
    setStatus(`SET #${state.setsFound} found!`, 'good');

    setTimeout(() => {
      state.selected = [];
      state.locked = false;
      if (state.setsFound >= state.dailyTarget) {
        finishGame();
      } else {
        renderAll(false);
      }
    }, 360);
    return;
  }

  // Classic or Zen mode
  state.setsFound++;
  state.hintIndices = [];
  state.locked = true;
  playTone('match');
  animateCards(state.selected, 'is-match');
  setStatus(`Nice SET! (${state.setsFound} found)`, 'good');

  const indicesDesc = [...state.selected].sort((a, b) => b - a);
  setTimeout(() => {
    if (state.mode === 'zen') {
      // Recycle used cards back into bottom of deck so Zen never runs out
      const used = indicesDesc.map((idx) => state.board[idx]);
      state.deck.push(...shuffle(used));
    }

    if (state.board.length <= 12 && state.deck.length >= 3) {
      // Replace in place to preserve spatial memory on the grid
      const sortedAsc = [...state.selected].sort((a, b) => a - b);
      const fresh = state.deck.splice(0, 3);
      sortedAsc.forEach((idx, n) => {
        state.board[idx] = fresh[n];
      });
    } else {
      // Shrink board back toward 12 (or clear out end-game cards)
      for (const idx of indicesDesc) {
        state.board.splice(idx, 1);
      }
    }

    state.selected = [];
    state.locked = false;

    if (state.mode === 'zen') {
      state.records.zenTotalSets++;
      saveJson(STORAGE_RECORDS, state.records);
      ensureBoardHasSet();
      renderAll(false);
      return;
    }

    // Check Classic win / auto-deal
    if (state.settings.autoDeal) {
      const extra = ensureBoardHasSet();
      if (extra > 0) {
        setStatus(`No SET on board — auto-dealt +${extra} cards.`, 'hint');
      }
    }

    const remainingSets = findAllSets(state.board).length;
    if (remainingSets === 0 && state.deck.length === 0) {
      finishGame();
    } else {
      renderAll(false);
    }
  }, 360);
}

function finishGame() {
  state.finished = true;
  stopTimer();
  if (state.startTime) {
    state.elapsedMs = Date.now() - state.startTime;
    elTimer.textContent = formatTime(state.elapsedMs);
  }
  playTone('win');

  let isNewBest = false;
  if (state.mode === 'classic') {
    state.records.classicCleared++;
    if (
      state.records.classicBestMs === null ||
      state.elapsedMs < state.records.classicBestMs
    ) {
      state.records.classicBestMs = state.elapsedMs;
      isNewBest = true;
    }
    saveJson(STORAGE_RECORDS, state.records);
  } else if (state.mode === 'daily') {
    if (!state.records.dailySolvedDates.includes(state.dailyDateKey)) {
      state.records.dailySolvedDates.push(state.dailyDateKey);
      saveJson(STORAGE_RECORDS, state.records);
    }
  }

  renderAll(false);

  const winTitle = document.getElementById('win-title');
  const winSub = document.getElementById('win-subtitle');
  const winStats = document.getElementById('win-stats');

  if (state.mode === 'daily') {
    winTitle.textContent = 'Daily Puzzle Complete!';
    winSub.textContent = `You found all ${state.dailyTarget} SETs for ${state.dailyDateKey}.`;
  } else {
    winTitle.textContent = isNewBest ? 'New Personal Best!' : 'Deck Cleared!';
    winSub.textContent =
      state.board.length > 0
        ? `No SETs remain among the final ${state.board.length} cards.`
        : 'Every single card in the 81-card deck was cleared!';
  }

  winStats.innerHTML = `
    <div class="record-card"><div class="record-label">Time</div><div class="record-value">${formatTime(state.elapsedMs)}</div></div>
    <div class="record-card"><div class="record-label">SETs Found</div><div class="record-value">${state.setsFound}</div></div>
    <div class="record-card"><div class="record-label">Mistakes</div><div class="record-value">${state.mistakes}</div></div>
    <div class="record-card"><div class="record-label">Hints Used</div><div class="record-value">${state.hintsUsed}</div></div>
  `;

  dialogWin.showModal();
}

// --- Actions ---
function handleHint() {
  if (state.locked || state.finished) return;

  let sets = findAllSets(state.board);
  if (state.mode === 'daily') {
    sets = sets.filter(
      (idxs) => !state.dailyFoundKeys.has(setKey(idxs.map((i) => state.board[i])))
    );
  }

  if (sets.length === 0) {
    if (state.deck.length >= 3) {
      setStatus('There is no SET on the board — tap "No SET (+3)" to deal 3 more cards!', 'hint');
    } else {
      finishGame();
    }
    return;
  }

  // Progressive hint: reveal 1 card, then 2 cards of the same SET
  const target = sets[0];
  if (state.hintIndices.length === 0) {
    state.hintIndices = [target[0]];
    state.hintsUsed++;
    setStatus('Hint: 1 card highlighted. Tap Hint again for a 2nd card.', 'hint');
  } else if (state.hintIndices.length === 1 && target.includes(state.hintIndices[0])) {
    const second = target.find((idx) => idx !== state.hintIndices[0]);
    state.hintIndices = [state.hintIndices[0], second];
    state.hintsUsed++;
    setStatus('Hint: 2 cards highlighted — deduce the unique 3rd card!', 'hint');
  } else {
    state.hintIndices = [target[0], target[1]];
    setStatus('Hint: 2 cards highlighted — deduce the unique 3rd card!', 'hint');
  }

  playTone('tap');
  updateCardStates();
}

function handleDealThree() {
  if (state.locked || state.finished || state.mode === 'daily') return;
  const sets = findAllSets(state.board);
  if (sets.length > 0) {
    playTone('mismatch');
    setStatus(
      `There ${sets.length === 1 ? 'is still 1 SET' : `are still ${sets.length} SETs`} on the board!`,
      'hint'
    );
    return;
  }

  if (state.deck.length < 3) {
    finishGame();
    return;
  }

  state.board.push(...state.deck.splice(0, 3));
  state.selected = [];
  state.hintIndices = [];
  playTone('tap');
  setStatus(`Good eye — no SET existed! Dealt +3 cards (${state.board.length} on board).`, 'good');
  renderAll(true);
}

function handleShuffleBoard() {
  if (state.locked || state.finished) return;
  state.board = shuffle(state.board);
  state.selected = [];
  state.hintIndices = [];
  playTone('tap');
  setStatus('Board shuffled for a fresh perspective.');
  renderAll(true);
}

// --- Rendering ---
function animateCards(indices, className) {
  for (const idx of indices) {
    const btn = elGrid.children[idx];
    if (btn) btn.classList.add(className);
  }
}

function updateCardStates() {
  const buttons = elGrid.children;
  for (let i = 0; i < buttons.length; i++) {
    const btn = buttons[i];
    btn.setAttribute('aria-pressed', String(state.selected.includes(i)));
    btn.classList.toggle('is-hint', state.hintIndices.includes(i));
    btn.classList.remove('is-mismatch', 'is-match');
  }
}

function renderAll(animateEnter = false) {
  elGrid.dataset.count = String(state.board.length);
  elGrid.innerHTML = '';

  state.board.forEach((card, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'set-card' + (animateEnter ? ' is-entering' : '');
    btn.setAttribute('aria-pressed', String(state.selected.includes(index)));
    btn.setAttribute('aria-label', cardAriaLabel(card, state.settings.colorblind));
    if (state.hintIndices.includes(index)) btn.classList.add('is-hint');

    const symbols = document.createElement('span');
    symbols.className = 'card-symbols';
    populateSymbols(symbols, card);
    btn.appendChild(symbols);

    btn.addEventListener('click', () => handleCardTap(index));
    elGrid.appendChild(btn);
  });

  // HUD updates
  if (state.mode === 'daily') {
    elSets.textContent = `${state.setsFound}/${state.dailyTarget}`;
    renderDailyTray();
  } else {
    elSets.textContent = String(state.setsFound);
    elDeck.textContent = String(state.deck.length);
  }

  if (state.settings.showCount && !state.finished) {
    let available = findAllSets(state.board);
    if (state.mode === 'daily') {
      available = available.filter(
        (idxs) => !state.dailyFoundKeys.has(setKey(idxs.map((i) => state.board[i])))
      );
    }
    elBtnDealLabel.textContent =
      available.length === 0 ? 'Deal +3 (0)' : `No SET (${available.length})`;
  } else {
    elBtnDealLabel.textContent = 'No SET';
  }

  elBtnDeal.disabled = state.deck.length === 0;
}

function renderDailyTray() {
  elDailyProgress.textContent = `${state.setsFound} / ${state.dailyTarget} found`;
  elDailySlots.innerHTML = '';
  for (let i = 0; i < state.dailyTarget; i++) {
    const slot = document.createElement('div');
    slot.className = 'daily-slot';
    const found = state.dailyFoundCards[i];
    if (found) {
      for (const card of found) {
        const mini = document.createElement('div');
        mini.className = 'mini-card';
        populateSymbols(mini, card);
        slot.appendChild(mini);
      }
    } else {
      slot.textContent = `SET #${i + 1}`;
    }
    elDailySlots.appendChild(slot);
  }
}

function renderRuleExamples() {
  const validCards = [
    { id: 1, color: 0, shape: 2, count: 0, shading: 0 }, // 1 red solid oval
    { id: 2, color: 0, shape: 2, count: 1, shading: 1 }, // 2 red striped ovals
    { id: 3, color: 0, shape: 2, count: 2, shading: 2 }, // 3 red open ovals
  ];
  const invalidCards = [
    { id: 4, color: 0, shape: 0, count: 0, shading: 0 }, // 1 red solid diamond
    { id: 5, color: 0, shape: 1, count: 1, shading: 1 }, // 2 red striped squiggles
    { id: 6, color: 1, shape: 2, count: 2, shading: 2 }, // 3 green open ovals
  ];

  const fill = (id, list) => {
    const el = document.getElementById(id);
    el.innerHTML = '';
    for (const c of list) {
      const box = document.createElement('div');
      box.className = 'example-card';
      populateSymbols(box, c);
      el.appendChild(box);
    }
  };
  fill('example-valid', validCards);
  fill('example-invalid', invalidCards);
}

function renderRecords() {
  const best =
    state.records.classicBestMs !== null ? formatTime(state.records.classicBestMs) : '—';
  elRecordsGrid.innerHTML = `
    <div class="record-card"><div class="record-label">Best Classic</div><div class="record-value">${best}</div></div>
    <div class="record-card"><div class="record-label">Decks Cleared</div><div class="record-value">${state.records.classicCleared}</div></div>
    <div class="record-card"><div class="record-label">Daily Solved</div><div class="record-value">${state.records.dailySolvedDates.length}</div></div>
    <div class="record-card"><div class="record-label">Zen SETs</div><div class="record-value">${state.records.zenTotalSets}</div></div>
  `;
}

function applySettingsToDom() {
  document.documentElement.dataset.palette = state.settings.colorblind ? 'colorblind' : 'classic';
  optColorblind.checked = state.settings.colorblind;
  optAutoDeal.checked = state.settings.autoDeal;
  optShowCount.checked = state.settings.showCount;
  optSound.checked = state.settings.sound;
}

// --- Event Wiring ---
document.querySelectorAll('.mode-pill').forEach((btn) => {
  btn.addEventListener('click', () => startGame(btn.dataset.mode));
});

elBtnHint.addEventListener('click', handleHint);
elBtnDeal.addEventListener('click', handleDealThree);
elBtnShuffle.addEventListener('click', handleShuffleBoard);
elBtnNew.addEventListener('click', () => startGame(state.mode));

elBtnRules.addEventListener('click', () => {
  renderRuleExamples();
  dialogRules.showModal();
});

elBtnSettings.addEventListener('click', () => {
  renderRecords();
  updateSystemSchemeHint();
  dialogSettings.showModal();
});

document.querySelectorAll('.seg-btn[data-scheme]').forEach((btn) => {
  btn.addEventListener('click', () => applyScheme(btn.dataset.scheme, true));
});

optColorblind.addEventListener('change', () => {
  state.settings.colorblind = optColorblind.checked;
  saveJson(STORAGE_SETTINGS, state.settings);
  applySettingsToDom();
  renderAll(false);
});

optAutoDeal.addEventListener('change', () => {
  state.settings.autoDeal = optAutoDeal.checked;
  saveJson(STORAGE_SETTINGS, state.settings);
  if (state.settings.autoDeal && state.mode !== 'daily') {
    ensureBoardHasSet();
    renderAll(false);
  }
});

optShowCount.addEventListener('change', () => {
  state.settings.showCount = optShowCount.checked;
  saveJson(STORAGE_SETTINGS, state.settings);
  renderAll(false);
});

optSound.addEventListener('change', () => {
  state.settings.sound = optSound.checked;
  saveJson(STORAGE_SETTINGS, state.settings);
});

// Keyboard shortcuts for desktop play
const CARD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i'];
window.addEventListener('keydown', (e) => {
  if (dialogRules.open || dialogSettings.open || dialogWin.open) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'escape') {
    state.selected = [];
    updateCardStates();
  } else if (k === 'h') {
    handleHint();
  } else if (k === 'n') {
    startGame(state.mode);
  } else if (k === '+') {
    handleDealThree();
  } else {
    const idx = CARD_KEYS.indexOf(k);
    if (idx !== -1 && idx < state.board.length) {
      handleCardTap(idx);
    }
  }
});

// Register offline Service Worker (only for web PWA, skip inside offline Android APK host)
if (
  'serviceWorker' in navigator &&
  location.hostname !== 'set.local' &&
  location.hostname !== 'appassets.androidplatform.net'
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// Boot
setupDialogs();
applyScheme(getStoredScheme(), false);
applySettingsToDom();
startGame('classic');

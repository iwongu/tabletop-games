import {
  DIFFICULTIES,
  findMatch,
  generateProjectiveDeck,
  layoutCardSymbols,
} from './engine.js';

const STORAGE_SETTINGS = 'spot-it-settings-v1';
const STORAGE_RECORDS = 'spot-it-records-v1';
const BLITZ_DURATION_MS = 60_000;

const MODE_LABELS = {
  sprint: 'Sprint',
  blitz: '60s',
  zen: 'Zen',
  duel: '2P Duel',
};

const defaultSettings = {
  difficulty: 'classic',
  rotate: true,
  sound: true,
};

const defaultRecords = {
  sprintBestMs: { easy: null, medium: null, classic: null },
  blitzBestScore: { easy: 0, medium: 0, classic: 0 },
  totalMatches: 0,
  bestStreak: 0,
};

const state = {
  mode: 'sprint',
  deck: [],
  cardTop: null,
  cardBottom: null,
  duelCenter: null,
  duelP1: null,
  duelP2: null,
  duelScoreP1: 0,
  duelScoreP2: 0,
  duelLockP1: false,
  duelLockP2: false,
  matches: 0,
  mistakes: 0,
  streak: 0,
  maxStreak: 0,
  score: 0,
  hintsUsed: 0,
  startTime: null,
  elapsedMs: 0,
  blitzPenaltyMs: 0,
  timerId: null,
  toastTimerId: null,
  locked: false,
  finished: false,
  settings: loadJson(STORAGE_SETTINGS, defaultSettings),
  records: loadRecords(),
};

// DOM references
const elModeTrigger = document.getElementById('btn-mode');
const elModeLabel = document.getElementById('mode-trigger-label');
const elHudStats = document.getElementById('hud-stats');
const elTimerWrap = document.getElementById('stat-timer-wrap');
const elTimer = document.getElementById('stat-timer');
const elScoreLabel = document.getElementById('stat-score-label');
const elScore = document.getElementById('stat-score');
const elStreakWrap = document.getElementById('stat-streak-wrap');
const elStreak = document.getElementById('stat-streak');
const elStatus = document.getElementById('status-banner');
const elStatusText = document.getElementById('status-text');
const elSoloStage = document.getElementById('solo-stage');
const elCardTop = document.getElementById('card-top');
const elCardBottom = document.getElementById('card-bottom');

const elDuelStage = document.getElementById('duel-stage');
const elDuelCardP1 = document.getElementById('duel-card-p1');
const elDuelCardP2 = document.getElementById('duel-card-p2');
const elDuelCardCenter = document.getElementById('duel-card-center');
const elDuelScoreP1 = document.getElementById('duel-score-p1');
const elDuelScoreP2 = document.getElementById('duel-score-p2');
const elDuelDeckLeft = document.getElementById('duel-deck-left');
const elDuelFeedback = document.getElementById('duel-feedback');

const elBtnRules = document.getElementById('btn-rules');
const elBtnSettings = document.getElementById('btn-settings');
const elBtnHint = document.getElementById('btn-hint');
const elBtnRotate = document.getElementById('btn-rotate');
const elBtnNew = document.getElementById('btn-new');

const dialogRules = document.getElementById('dialog-rules');
const dialogSettings = document.getElementById('dialog-settings');
const dialogWin = document.getElementById('dialog-win');
const optRotate = document.getElementById('opt-rotate');
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

function loadRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_RECORDS);
    if (!raw) return structuredClone(defaultRecords);
    const parsed = JSON.parse(raw);
    return {
      sprintBestMs: { ...defaultRecords.sprintBestMs, ...(parsed.sprintBestMs || {}) },
      blitzBestScore: { ...defaultRecords.blitzBestScore, ...(parsed.blitzBestScore || {}) },
      totalMatches: parsed.totalMatches || 0,
      bestStreak: parsed.bestStreak || 0,
    };
  } catch {
    return structuredClone(defaultRecords);
  }
}

function saveJson(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}

// --- Synthesized Web Audio ---
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
      const boost = Math.min(streak - 1, 8) * 32;
      tone(520 + boost, now, 0.11, 0.08, 'triangle');
      tone(740 + boost, now + 0.055, 0.15, 0.08, 'sine');
    } else if (type === 'wrong') {
      tone(210, now, 0.14, 0.07, 'sawtooth');
    } else if (type === 'hint') {
      tone(440, now, 0.12, 0.05, 'sine');
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

// --- Formatting & Timer ---
function formatTime(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${m}:${s}`;
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

function showToast(msg, tone = 'neutral', durationMs = 1200) {
  elStatusText.textContent = msg;
  elStatus.dataset.tone = tone;
  elStatus.dataset.visible = 'true';
  if (state.toastTimerId !== null) clearTimeout(state.toastTimerId);
  state.toastTimerId = setTimeout(() => {
    elStatus.dataset.visible = 'false';
  }, durationMs);
}

// --- Card Rendering ---
function renderSpotCard(container, card, { interactive = true, onTap = null, animate = false } = {}) {
  container.innerHTML = '';
  container.dataset.k = String(card.symbols.length);
  if (animate) {
    container.classList.remove('is-entering');
    void container.offsetWidth;
    container.classList.add('is-entering');
  }

  const placements = layoutCardSymbols(card.symbols);
  for (const item of placements) {
    const btn = document.createElement(interactive ? 'button' : 'span');
    if (interactive) btn.type = 'button';
    btn.className = 'sym-btn';
    btn.dataset.symId = String(item.symbol.id);
    btn.style.setProperty('--x', `${item.x.toFixed(1)}%`);
    btn.style.setProperty('--y', `${item.y.toFixed(1)}%`);
    btn.style.setProperty('--size', `${item.sizePct.toFixed(1)}cqi`);
    btn.style.setProperty('--rot', state.settings.rotate ? `${item.rot}deg` : '0deg');
    const glyph = document.createElement('span');
    glyph.className = 'sym-glyph';
    glyph.textContent = item.symbol.glyph;
    btn.appendChild(glyph);
    btn.setAttribute('aria-label', item.symbol.name);

    if (interactive && onTap) {
      btn.addEventListener('click', () => onTap(item.symbol, btn));
    } else {
      btn.classList.add('is-static');
    }
    container.appendChild(btn);
  }
}

function highlightSymbolIn(container, symId, className) {
  const el = container.querySelector(`.sym-btn[data-sym-id="${symId}"]`);
  if (el) el.classList.add(className);
}

// --- Game Lifecycle ---
function getDiff() {
  return DIFFICULTIES[state.settings.difficulty] || DIFFICULTIES.classic;
}

function startGame(mode = state.mode) {
  state.mode = mode;
  state.matches = 0;
  state.mistakes = 0;
  state.streak = 0;
  state.maxStreak = 0;
  state.score = 0;
  state.hintsUsed = 0;
  state.locked = false;
  state.finished = false;
  state.duelScoreP1 = 0;
  state.duelScoreP2 = 0;
  state.duelLockP1 = false;
  state.duelLockP2 = false;
  elStatus.dataset.visible = 'false';

  for (const btn of document.querySelectorAll('.seg-btn[data-mode]')) {
    btn.setAttribute('aria-checked', String(btn.dataset.mode === mode));
  }

  const diff = getDiff();
  elModeLabel.textContent = `${MODE_LABELS[mode]} · ${diff.symbolsPerCard}`;
  state.deck = generateProjectiveDeck(diff.order);

  const isDuel = mode === 'duel';
  elSoloStage.hidden = isDuel;
  elDuelStage.hidden = !isDuel;
  elHudStats.hidden = isDuel;
  elBtnHint.hidden = isDuel || mode === 'blitz';
  elBtnRotate.hidden = isDuel;

  if (isDuel) {
    stopTimer();
    state.duelP1 = state.deck.pop();
    state.duelP2 = state.deck.pop();
    state.duelCenter = state.deck.pop();
    elDuelCardP1.classList.remove('is-locked');
    elDuelCardP2.classList.remove('is-locked');
    elDuelFeedback.textContent = 'Tap YOUR card';
    renderDuel(true, true, true);
    return;
  }

  state.cardBottom = state.deck.pop();
  state.cardTop = state.deck.pop();

  elTimerWrap.hidden = mode === 'zen';
  elStreakWrap.hidden = mode === 'zen';

  if (mode === 'sprint') {
    elScoreLabel.textContent = 'left';
  } else if (mode === 'blitz') {
    elScoreLabel.textContent = 'pts';
  } else {
    elScoreLabel.textContent = 'found';
  }

  updateSoloHud();
  renderSolo(true, true);
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

function renderSolo(animTop = false, animBottom = false) {
  renderSpotCard(elCardTop, state.cardTop, {
    interactive: true,
    onTap: (sym, btn) => handleSoloTap(sym, btn),
    animate: animTop,
  });
  renderSpotCard(elCardBottom, state.cardBottom, {
    interactive: true,
    onTap: (sym, btn) => handleSoloTap(sym, btn),
    animate: animBottom,
  });
}

function handleSoloTap(symbol, tappedBtn) {
  if (state.locked || state.finished) return;
  const match = findMatch(state.cardTop, state.cardBottom);
  if (!match) return;

  if (symbol.id !== match.id) {
    state.mistakes++;
    state.streak = 0;
    playTone('wrong');
    tappedBtn.classList.remove('is-wrong');
    void tappedBtn.offsetWidth;
    tappedBtn.classList.add('is-wrong');
    if (state.mode === 'blitz') {
      state.blitzPenaltyMs += 2000;
      showToast(`Not ${symbol.glyph} (−2s)`, 'bad', 950);
    } else {
      showToast(`Not ${symbol.glyph} ${symbol.name}`, 'bad', 900);
    }
    updateSoloHud();
    return;
  }

  state.locked = true;
  state.matches++;
  state.streak++;
  if (state.streak > state.maxStreak) state.maxStreak = state.streak;

  const mult = Math.min(5, 1 + Math.floor((state.streak - 1) / 3));
  const points = 100 * mult;
  state.score += points;

  state.records.totalMatches++;
  if (state.streak > state.records.bestStreak) state.records.bestStreak = state.streak;
  saveJson(STORAGE_RECORDS, state.records);

  playTone('match', state.streak);
  highlightSymbolIn(elCardTop, match.id, 'is-match');
  highlightSymbolIn(elCardBottom, match.id, 'is-match');

  const msg =
    state.mode === 'blitz'
      ? `${match.glyph} +${points}${mult > 1 ? ` (${mult}×)` : ''}`
      : `${match.glyph} ${match.name}!`;
  showToast(msg, 'good', 850);
  updateSoloHud();

  setTimeout(() => {
    if (state.finished) return;
    state.cardBottom = state.cardTop;

    if (state.deck.length === 0) {
      if (state.mode === 'sprint') {
        state.locked = false;
        finishGame();
        return;
      }
      const fresh = generateProjectiveDeck(getDiff().order).filter(
        (c) =>
          findMatch(c, state.cardBottom) !== null &&
          c.symbols.map((s) => s.id).sort().join(',') !==
            state.cardBottom.symbols.map((s) => s.id).sort().join(',')
      );
      state.deck = fresh;
    }

    state.cardTop = state.deck.pop();
    state.locked = false;
    updateSoloHud();
    renderSolo(true, false);
  }, 240);
}

// --- 2-Player Tabletop Duel ---
function renderDuel(animCenter = false, animP1 = false, animP2 = false) {
  elDuelScoreP1.textContent = `P1 · ${state.duelScoreP1}`;
  elDuelScoreP2.textContent = `P2 · ${state.duelScoreP2}`;
  elDuelDeckLeft.textContent = `${state.deck.length + 1} left`;

  renderSpotCard(elDuelCardCenter, state.duelCenter, {
    interactive: false,
    animate: animCenter,
  });
  renderSpotCard(elDuelCardP1, state.duelP1, {
    interactive: true,
    onTap: (sym, btn) => handleDuelTap(1, sym, btn),
    animate: animP1,
  });
  renderSpotCard(elDuelCardP2, state.duelP2, {
    interactive: true,
    onTap: (sym, btn) => handleDuelTap(2, sym, btn),
    animate: animP2,
  });
}

function handleDuelTap(player, symbol, tappedBtn) {
  if (state.locked || state.finished) return;
  if (player === 1 && state.duelLockP1) return;
  if (player === 2 && state.duelLockP2) return;

  const playerCard = player === 1 ? state.duelP1 : state.duelP2;
  const playerEl = player === 1 ? elDuelCardP1 : elDuelCardP2;
  const match = findMatch(playerCard, state.duelCenter);

  if (!match || symbol.id !== match.id) {
    playTone('wrong');
    tappedBtn.classList.add('is-wrong');
    playerEl.classList.add('is-locked');
    if (player === 1) state.duelLockP1 = true;
    else state.duelLockP2 = true;
    setTimeout(() => {
      if (player === 1) state.duelLockP1 = false;
      else state.duelLockP2 = false;
      playerEl.classList.remove('is-locked');
      tappedBtn.classList.remove('is-wrong');
    }, 650);
    return;
  }

  state.locked = true;
  if (player === 1) state.duelScoreP1++;
  else state.duelScoreP2++;
  playTone('match', 3);

  highlightSymbolIn(elDuelCardCenter, match.id, 'is-match');
  highlightSymbolIn(playerEl, match.id, 'is-match');
  elDuelFeedback.textContent = `P${player}: ${match.glyph}`;

  setTimeout(() => {
    if (player === 1) state.duelP1 = state.duelCenter;
    else state.duelP2 = state.duelCenter;

    if (state.deck.length === 0) {
      state.locked = false;
      finishGame();
      return;
    }

    state.duelCenter = state.deck.pop();
    state.locked = false;
    renderDuel(true, player === 1, player === 2);
  }, 240);
}

// --- Finish & Summary Modal ---
function finishGame() {
  state.finished = true;
  stopTimer();
  playTone('win');

  const diffId = state.settings.difficulty;
  const winTitle = document.getElementById('win-title');
  const winSub = document.getElementById('win-subtitle');
  const winStats = document.getElementById('win-stats');

  if (state.mode === 'duel') {
    const p1 = state.duelScoreP1;
    const p2 = state.duelScoreP2;
    winTitle.textContent = p1 === p2 ? "It's a Tie!" : p1 > p2 ? 'Player 1 Wins!' : 'Player 2 Wins!';
    winSub.textContent = `${getDiff().label} Duel complete.`;
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
    const prev = state.records.sprintBestMs[diffId];
    if (prev === null || state.elapsedMs < prev) {
      state.records.sprintBestMs[diffId] = state.elapsedMs;
      isRecord = true;
      saveJson(STORAGE_RECORDS, state.records);
    }
    const avg = (state.elapsedMs / Math.max(1, state.matches) / 1000).toFixed(2);
    winTitle.textContent = isRecord ? 'New Best Sprint!' : 'Deck Cleared!';
    winSub.textContent = `${getDiff().label} deck (${getDiff().symbolsPerCard} symbols/card) cleared.`;
    winStats.innerHTML = `
      <div class="record-card"><div class="record-label">Time</div><div class="record-value">${formatTime(state.elapsedMs)}</div></div>
      <div class="record-card"><div class="record-label">Avg / Card</div><div class="record-value">${avg}s</div></div>
      <div class="record-card"><div class="record-label">Best Streak</div><div class="record-value">${state.maxStreak}</div></div>
      <div class="record-card"><div class="record-label">Mistakes</div><div class="record-value">${state.mistakes}</div></div>
    `;
  } else if (state.mode === 'blitz') {
    if (state.score > (state.records.blitzBestScore[diffId] || 0)) {
      state.records.blitzBestScore[diffId] = state.score;
      isRecord = true;
      saveJson(STORAGE_RECORDS, state.records);
    }
    winTitle.textContent = isRecord ? 'New High Score!' : "Time's Up!";
    winSub.textContent = `60-Second Blitz (${getDiff().label}).`;
    winStats.innerHTML = `
      <div class="record-card"><div class="record-label">Score</div><div class="record-value">${state.score}</div></div>
      <div class="record-card"><div class="record-label">Matches</div><div class="record-value">${state.matches}</div></div>
      <div class="record-card"><div class="record-label">Best Streak</div><div class="record-value">${state.maxStreak}</div></div>
      <div class="record-card"><div class="record-label">Mistakes</div><div class="record-value">${state.mistakes}</div></div>
    `;
  }

  dialogWin.showModal();
}

// --- Helpers & Controls ---
function handleHint() {
  if (state.locked || state.finished || state.mode === 'duel' || state.mode === 'blitz') return;
  const match = findMatch(state.cardTop, state.cardBottom);
  if (!match) return;
  state.hintsUsed++;
  state.streak = 0;
  playTone('hint');
  highlightSymbolIn(elCardTop, match.id, 'is-hint');
  showToast(`Hint: ${match.name}`, 'hint', 1500);
  updateSoloHud();
}

function handleSpinCards() {
  if (state.locked || state.finished || state.mode === 'duel') return;
  playTone('hint');
  renderSolo(true, true);
}

function renderRecords() {
  const diffId = state.settings.difficulty;
  const bestSprint =
    state.records.sprintBestMs[diffId] !== null
      ? formatTime(state.records.sprintBestMs[diffId])
      : '—';
  const bestBlitz = state.records.blitzBestScore[diffId] || 0;
  elRecordsGrid.innerHTML = `
    <div class="record-card"><div class="record-label">Best Sprint (${getDiff().label})</div><div class="record-value">${bestSprint}</div></div>
    <div class="record-card"><div class="record-label">Best 60s (${getDiff().label})</div><div class="record-value">${bestBlitz}</div></div>
    <div class="record-card"><div class="record-label">Best Streak</div><div class="record-value">${state.records.bestStreak}</div></div>
    <div class="record-card"><div class="record-label">Total Matches</div><div class="record-value">${state.records.totalMatches}</div></div>
  `;
}

function applySettingsToDom() {
  optRotate.checked = state.settings.rotate;
  optSound.checked = state.settings.sound;
  for (const btn of document.querySelectorAll('.seg-btn[data-diff]')) {
    btn.setAttribute('aria-checked', String(btn.dataset.diff === state.settings.difficulty));
  }
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
elBtnRotate.addEventListener('click', handleSpinCards);
elBtnNew.addEventListener('click', () => startGame(state.mode));

document.querySelectorAll('.seg-btn[data-mode]').forEach((btn) => {
  btn.addEventListener('click', () => {
    startGame(btn.dataset.mode);
  });
});

document.querySelectorAll('.seg-btn[data-diff]').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.settings.difficulty = btn.dataset.diff;
    saveJson(STORAGE_SETTINGS, state.settings);
    applySettingsToDom();
    renderRecords();
    startGame(state.mode);
  });
});

document.querySelectorAll('.seg-btn[data-scheme]').forEach((btn) => {
  btn.addEventListener('click', () => applyScheme(btn.dataset.scheme, true));
});

optRotate.addEventListener('change', () => {
  state.settings.rotate = optRotate.checked;
  saveJson(STORAGE_SETTINGS, state.settings);
  if (state.mode === 'duel') renderDuel(false, false, false);
  else renderSolo(false, false);
});

optSound.addEventListener('change', () => {
  state.settings.sound = optSound.checked;
  saveJson(STORAGE_SETTINGS, state.settings);
});

// Service Worker registration (only for web PWA, skip inside offline Android APK host)
if (
  'serviceWorker' in navigator &&
  location.hostname !== 'spotit.local' &&
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
startGame('sprint');

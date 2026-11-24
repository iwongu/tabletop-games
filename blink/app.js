import {
  COLORS,
  SHAPES,
  canPlayOn,
  cardAriaLabel,
  findValidMoves,
  generateDeck,
  getMatchReasons,
  shuffle,
} from './engine.js';

const STORAGE_SETTINGS = 'blink-settings-v1';
const STORAGE_RECORDS = 'blink-records-v1';

const MODE_LABELS = {
  sprint: 'Sprint',
  bot: 'vs Bot',
  duel: '2P Duel',
};

const BOT_DELAY_MS = {
  easy: [1650, 2400],
  medium: [1000, 1550],
  fast: [580, 950],
};

// Crisp vector SVG paths inside viewBox="0 0 64 64"
const SHAPE_PATHS = {
  0: 'M32 5 L39.5 22 L58 24 L44 36.5 L48 55 L32 45.5 L16 55 L20 36.5 L6 24 L24.5 22 Z', // Star
  1: 'M32 7 L58 54 L6 54 Z', // Triangle
  2: 'M42 8 C24 8 11 20 11 35 C11 49 23 58 39 58 C46 58 52 55 56 50 C49 52 41 49 36 43 C30 35 31 20 42 8 Z', // Moon
  3: 'M24 8 L40 8 L40 24 L56 24 L56 40 L40 40 L40 56 L24 56 L24 40 L8 40 L8 24 L24 24 Z', // Cross
  4: 'M38 5 L12 36 L29 36 L24 59 L52 27 L34 27 Z', // Lightning
  5: 'M32 5 L56 32 L32 59 L8 32 Z', // Diamond
};

const defaultSettings = {
  botSpeed: 'medium',
  sound: true,
};

const defaultRecords = {
  sprintBestMs: null,
  botWins: 0,
  totalPlayed: 0,
  bestStreak: 0,
};

const state = {
  mode: 'sprint', // 'sprint' | 'bot' | 'duel'
  piles: [null, null],
  pileHistory: [[], []],
  reserve: [],
  // Player 1
  p1Draw: [],
  p1Hand: [null, null, null],
  p1Selected: null, // hand index or null
  // Player 2 / Bot
  p2Draw: [],
  p2Hand: [null, null, null],
  p2Selected: null,
  // Stats
  playedCount: 0,
  mistakes: 0,
  streak: 0,
  maxStreak: 0,
  startTime: null,
  elapsedMs: 0,
  timerId: null,
  botTimerId: null,
  toastTimerId: null,
  finished: false,
  settings: loadJson(STORAGE_SETTINGS, defaultSettings),
  records: loadJson(STORAGE_RECORDS, defaultRecords),
};

// DOM references
const elShell = document.getElementById('app-shell');
const elModeTrigger = document.getElementById('btn-mode');
const elModeLabel = document.getElementById('mode-trigger-label');
const elTimer = document.getElementById('stat-timer');
const elLeft = document.getElementById('stat-left');
const elOppWrap = document.getElementById('stat-opp-wrap');
const elOppLabel = document.getElementById('stat-opp-label');
const elOpp = document.getElementById('stat-opp');
const elStreakWrap = document.getElementById('stat-streak-wrap');
const elStreak = document.getElementById('stat-streak');

const elZoneP2 = document.getElementById('zone-p2');
const elHandP2 = document.getElementById('hand-p2');
const elBadgeP2 = document.getElementById('badge-p2');
const elMetaP1 = document.getElementById('meta-p1');
const elBadgeP1 = document.getElementById('badge-p1');
const elHandP1 = document.getElementById('hand-p1');
const elPile0 = document.getElementById('pile-0');
const elPile1 = document.getElementById('pile-1');
const elBtnFlip = document.getElementById('btn-flip');
const elStatus = document.getElementById('status-banner');
const elStatusText = document.getElementById('status-text');

const elBtnNew = document.getElementById('btn-new');
const elBtnRules = document.getElementById('btn-rules');
const elBtnSettings = document.getElementById('btn-settings');

const dialogRules = document.getElementById('dialog-rules');
const dialogSettings = document.getElementById('dialog-settings');
const dialogWin = document.getElementById('dialog-win');
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

function playTone(type, streak = 1) {
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
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    };

    if (type === 'play') {
      const boost = Math.min(streak - 1, 10) * 24;
      tone(480 + boost, now, 0.08, 0.07, 'triangle');
    } else if (type === 'bot') {
      tone(330, now, 0.08, 0.05, 'triangle');
    } else if (type === 'wrong') {
      tone(190, now, 0.13, 0.07, 'sawtooth');
    } else if (type === 'flip') {
      tone(380, now, 0.07, 0.05);
      tone(520, now + 0.06, 0.09, 0.05);
    } else if (type === 'win') {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        tone(f, now + i * 0.08, 0.25, 0.09)
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

// --- Card SVG Rendering ---
function renderCardInnerHtml(card) {
  if (!card) return '';
  const color = COLORS[card.color].hex;
  const path = SHAPE_PATHS[card.shape];
  const svgs = Array.from({ length: card.count }, () =>
    `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="${path}" fill="${color}"/></svg>`
  ).join('');
  return `
    <span class="card-corner tl" style="color:${color}">${card.count}</span>
    <div class="pip-grid" data-count="${card.count}">${svgs}</div>
    <span class="card-corner br" style="color:${color}">${card.count}</span>
  `;
}

// --- Timers & Toast ---
function formatTime(ms) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

function stopTimers() {
  if (state.timerId !== null) { clearInterval(state.timerId); state.timerId = null; }
  if (state.botTimerId !== null) { clearTimeout(state.botTimerId); state.botTimerId = null; }
}

function startClock() {
  if (state.timerId !== null) clearInterval(state.timerId);
  state.startTime = Date.now();
  state.elapsedMs = 0;
  elTimer.textContent = '00:00';
  state.timerId = setInterval(() => {
    if (!state.finished) {
      state.elapsedMs = Date.now() - state.startTime;
      elTimer.textContent = formatTime(state.elapsedMs);
    }
  }, 200);
}

function showToast(msg, tone = 'neutral', ms = 850) {
  elStatusText.textContent = msg;
  elStatus.dataset.tone = tone;
  elStatus.dataset.visible = 'true';
  if (state.toastTimerId !== null) clearTimeout(state.toastTimerId);
  state.toastTimerId = setTimeout(() => {
    elStatus.dataset.visible = 'false';
  }, ms);
}

// --- Game Lifecycle ---
function cardsRemaining(draw, hand) {
  return draw.length + hand.filter(Boolean).length;
}

function fillHand(draw, hand) {
  for (let i = 0; i < 3; i++) {
    if (!hand[i] && draw.length > 0) hand[i] = draw.pop();
  }
}

function startGame(mode = state.mode) {
  stopTimers();
  state.mode = mode;
  state.finished = false;
  state.playedCount = 0;
  state.mistakes = 0;
  state.streak = 0;
  state.maxStreak = 0;
  state.p1Selected = null;
  state.p2Selected = null;
  state.pileHistory = [[], []];
  elStatus.dataset.visible = 'false';

  const fullDeck = generateDeck();
  state.piles = [fullDeck.pop(), fullDeck.pop()];

  if (mode === 'sprint') {
    state.p1Draw = fullDeck.slice(0, 30);
    state.reserve = fullDeck.slice(30);
    state.p2Draw = [];
    state.p2Hand = [null, null, null];
  } else {
    // 29 cards each (58 remaining split evenly!)
    state.p1Draw = fullDeck.slice(0, 29);
    state.p2Draw = fullDeck.slice(29, 58);
    state.reserve = [];
  }

  state.p1Hand = [null, null, null];
  fillHand(state.p1Draw, state.p1Hand);
  if (mode !== 'sprint') {
    state.p2Hand = [null, null, null];
    fillHand(state.p2Draw, state.p2Hand);
  }

  elModeLabel.textContent = MODE_LABELS[mode];
  for (const btn of document.querySelectorAll('.seg-btn[data-mode]')) {
    btn.setAttribute('aria-checked', String(btn.dataset.mode === mode));
  }

  const hasTwo = mode !== 'sprint';
  elShell.classList.toggle('has-two-hands', hasTwo);
  elZoneP2.hidden = !hasTwo;
  elZoneP2.classList.toggle('is-duel-flip', mode === 'duel');
  elMetaP1.hidden = !hasTwo;
  elOppWrap.hidden = !hasTwo;
  elStreakWrap.hidden = mode === 'duel';
  if (mode === 'bot') elOppLabel.textContent = 'Bot';
  if (mode === 'duel') elOppLabel.textContent = 'P2';

  renderAll();
  startClock();
  if (mode === 'bot') scheduleBotMove();
}

function scheduleBotMove() {
  if (state.finished || state.mode !== 'bot') return;
  if (state.botTimerId !== null) clearTimeout(state.botTimerId);

  const [minMs, maxMs] = BOT_DELAY_MS[state.settings.botSpeed] || BOT_DELAY_MS.medium;
  const delay = minMs + Math.random() * (maxMs - minMs);

  state.botTimerId = setTimeout(() => {
    if (state.finished || state.mode !== 'bot') return;
    const moves = findValidMoves(state.p2Hand, state.piles);
    if (moves.length > 0) {
      const pick = moves[Math.floor(Math.random() * moves.length)];
      executePlay(2, pick.handIndex, pick.pileIndex);
    }
    if (!state.finished) scheduleBotMove();
  }, delay);
}

// --- Play Execution ---
function handleHandTap(player, handIndex) {
  if (state.finished) return;
  if (player === 2 && state.mode !== 'duel') return;

  const hand = player === 1 ? state.p1Hand : state.p2Hand;
  const card = hand[handIndex];
  if (!card) return;

  const canLeft = canPlayOn(card, state.piles[0]);
  const canRight = canPlayOn(card, state.piles[1]);

  if (!canLeft && !canRight) {
    playTone('wrong');
    if (player === 1) {
      state.mistakes++;
      state.streak = 0;
      showToast('No match!', 'bad', 700);
    }
    const row = player === 1 ? elHandP1 : elHandP2;
    const btn = row.children[handIndex];
    if (btn) {
      btn.classList.remove('is-wrong');
      void btn.offsetWidth;
      btn.classList.add('is-wrong');
    }
    updateHud();
    return;
  }

  // Smart 1-Tap Play: if unambiguous, slap onto that pile immediately!
  if (canLeft && !canRight) {
    executePlay(player, handIndex, 0);
    return;
  }
  if (canRight && !canLeft) {
    executePlay(player, handIndex, 1);
    return;
  }

  // Matches BOTH piles: select it so tapping a pile chooses, or tap same card again to auto-play Left
  const selectedKey = player === 1 ? 'p1Selected' : 'p2Selected';
  if (state[selectedKey] === handIndex) {
    executePlay(player, handIndex, 0);
  } else {
    state[selectedKey] = handIndex;
    renderAll();
  }
}

function handlePileTap(pileIndex) {
  if (state.finished) return;
  // Check if P1 has a selected card that fits this pile
  if (state.p1Selected !== null && canPlayOn(state.p1Hand[state.p1Selected], state.piles[pileIndex])) {
    executePlay(1, state.p1Selected, pileIndex);
    return;
  }
  if (state.mode === 'duel' && state.p2Selected !== null && canPlayOn(state.p2Hand[state.p2Selected], state.piles[pileIndex])) {
    executePlay(2, state.p2Selected, pileIndex);
  }
}

function executePlay(player, handIndex, pileIndex) {
  const hand = player === 1 ? state.p1Hand : state.p2Hand;
  const draw = player === 1 ? state.p1Draw : state.p2Draw;
  const card = hand[handIndex];
  if (!card || !canPlayOn(card, state.piles[pileIndex])) return;

  const reasons = getMatchReasons(card, state.piles[pileIndex]);
  state.pileHistory[pileIndex].push(state.piles[pileIndex]);
  state.piles[pileIndex] = card;
  hand[handIndex] = draw.length > 0 ? draw.pop() : null;

  if (player === 1) {
    state.p1Selected = null;
    state.playedCount++;
    state.streak++;
    if (state.streak > state.maxStreak) state.maxStreak = state.streak;
    state.records.totalPlayed++;
    if (state.streak > state.records.bestStreak) state.records.bestStreak = state.streak;
    saveJson(STORAGE_RECORDS, state.records);
    playTone('play', state.streak);
    if (state.mode === 'sprint') {
      showToast(reasons.join(' + '), 'good', 650);
    }
  } else {
    state.p2Selected = null;
    playTone(state.mode === 'bot' ? 'bot' : 'play', 2);
  }

  // Check if someone emptied their deck!
  const p1Left = cardsRemaining(state.p1Draw, state.p1Hand);
  const p2Left = cardsRemaining(state.p2Draw, state.p2Hand);

  renderAll(pileIndex);

  if (p1Left === 0) {
    finishGame(1);
  } else if (state.mode !== 'sprint' && p2Left === 0) {
    finishGame(2);
  }
}

function handleFlipPiles() {
  if (state.finished) return;
  playTone('flip');

  for (let p = 0; p < 2; p++) {
    let nextCard = null;
    if (state.reserve.length > 0) {
      nextCard = state.reserve.pop();
      state.pileHistory[p].push(state.piles[p]);
    } else if (state.pileHistory[p].length > 0) {
      // Recycle bottom of discard pile shuffled
      const recycled = shuffle(state.pileHistory[p]);
      nextCard = recycled.pop();
      state.pileHistory[p] = [state.piles[p], ...recycled];
    } else {
      // Fallback: swap from other pile's history or draw from reserve
      const other = 1 - p;
      if (state.pileHistory[other].length > 0) {
        nextCard = state.pileHistory[other].shift();
        state.pileHistory[p].push(state.piles[p]);
      }
    }
    if (nextCard) state.piles[p] = nextCard;
  }

  state.p1Selected = null;
  state.p2Selected = null;
  showToast('Fresh piles!', 'good', 700);
  renderAll();
}

function checkDeadlock() {
  if (state.finished) {
    elBtnFlip.hidden = true;
    return;
  }
  const p1Moves = findValidMoves(state.p1Hand, state.piles).length;
  const p2Moves = state.mode === 'sprint' ? 0 : findValidMoves(state.p2Hand, state.piles).length;
  const stuck = p1Moves === 0 && p2Moves === 0;
  elBtnFlip.hidden = !stuck;
}

function finishGame(winner) {
  state.finished = true;
  stopTimers();
  state.elapsedMs = Date.now() - state.startTime;
  elTimer.textContent = formatTime(state.elapsedMs);
  playTone('win');

  const winTitle = document.getElementById('win-title');
  const winSub = document.getElementById('win-subtitle');
  const winStats = document.getElementById('win-stats');

  if (state.mode === 'sprint') {
    let isRecord = false;
    if (state.records.sprintBestMs === null || state.elapsedMs < state.records.sprintBestMs) {
      state.records.sprintBestMs = state.elapsedMs;
      isRecord = true;
      saveJson(STORAGE_RECORDS, state.records);
    }
    const rate = (state.playedCount / Math.max(0.5, state.elapsedMs / 1000)).toFixed(2);
    winTitle.textContent = isRecord ? 'New Best Sprint!' : 'Blink! Deck Cleared!';
    winSub.textContent = 'All 30 cards played.';
    winStats.innerHTML = `
      <div class="record-card"><div class="record-label">Time</div><div class="record-value">${formatTime(state.elapsedMs)}</div></div>
      <div class="record-card"><div class="record-label">Speed</div><div class="record-value">${rate}/s</div></div>
      <div class="record-card"><div class="record-label">Best Streak</div><div class="record-value">${state.maxStreak}</div></div>
      <div class="record-card"><div class="record-label">Mistakes</div><div class="record-value">${state.mistakes}</div></div>
    `;
  } else if (state.mode === 'bot') {
    const p1Left = cardsRemaining(state.p1Draw, state.p1Hand);
    const p2Left = cardsRemaining(state.p2Draw, state.p2Hand);
    if (winner === 1) {
      state.records.botWins++;
      saveJson(STORAGE_RECORDS, state.records);
    }
    winTitle.textContent = winner === 1 ? 'You Beat the Bot!' : 'Bot Wins!';
    winSub.textContent = `Bot speed: ${state.settings.botSpeed}`;
    winStats.innerHTML = `
      <div class="record-card"><div class="record-label">Time</div><div class="record-value">${formatTime(state.elapsedMs)}</div></div>
      <div class="record-card"><div class="record-label">Your Cards Left</div><div class="record-value">${p1Left}</div></div>
      <div class="record-card"><div class="record-label">Bot Cards Left</div><div class="record-value">${p2Left}</div></div>
      <div class="record-card"><div class="record-label">Mistakes</div><div class="record-value">${state.mistakes}</div></div>
    `;
  } else {
    const p1Left = cardsRemaining(state.p1Draw, state.p1Hand);
    const p2Left = cardsRemaining(state.p2Draw, state.p2Hand);
    winTitle.textContent = winner === 1 ? 'Player 1 Wins!' : 'Player 2 Wins!';
    winSub.textContent = `Finished in ${formatTime(state.elapsedMs)}.`;
    winStats.innerHTML = `
      <div class="record-card"><div class="record-label">Player 1 Left</div><div class="record-value">${p1Left}</div></div>
      <div class="record-card"><div class="record-label">Player 2 Left</div><div class="record-value">${p2Left}</div></div>
    `;
  }

  dialogWin.showModal();
}

// --- Rendering ---
function updateHud() {
  const p1Left = cardsRemaining(state.p1Draw, state.p1Hand);
  const p2Left = cardsRemaining(state.p2Draw, state.p2Hand);
  elLeft.textContent = String(p1Left);
  elStreak.textContent = String(state.streak);
  elOpp.textContent = String(p2Left);
  elBadgeP1.textContent = `P1 · ${p1Left} left`;
  elBadgeP2.textContent = `${state.mode === 'bot' ? 'Bot' : 'P2'} · ${p2Left} left`;
}

function renderHand(container, hand, player, selectedIdx) {
  container.innerHTML = '';
  const isBot = player === 2 && state.mode === 'bot';
  for (let i = 0; i < 3; i++) {
    const card = hand[i];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'blink-card hand-card';
    if (!card) {
      btn.classList.add('is-empty');
      btn.disabled = true;
    } else {
      btn.innerHTML = renderCardInnerHtml(card);
      btn.setAttribute('aria-label', cardAriaLabel(card));
      if (isBot) {
        btn.classList.add('is-bot');
        btn.tabIndex = -1;
      } else {
        if (selectedIdx === i) btn.classList.add('is-selected');
        btn.addEventListener('click', () => handleHandTap(player, i));
      }
    }
    container.appendChild(btn);
  }
}

function renderAll(slappedPile = null) {
  // Render center piles
  [elPile0, elPile1].forEach((el, idx) => {
    const card = state.piles[idx];
    el.innerHTML = renderCardInnerHtml(card);
    el.setAttribute('aria-label', `${idx === 0 ? 'Left' : 'Right'} pile: ${cardAriaLabel(card)}`);
    el.classList.remove('is-slapped', 'is-target');
    if (slappedPile === idx) {
      void el.offsetWidth;
      el.classList.add('is-slapped');
    }
    const p1Sel = state.p1Selected !== null && canPlayOn(state.p1Hand[state.p1Selected], card);
    const p2Sel = state.mode === 'duel' && state.p2Selected !== null && canPlayOn(state.p2Hand[state.p2Selected], card);
    if (p1Sel || p2Sel) el.classList.add('is-target');
  });

  renderHand(elHandP1, state.p1Hand, 1, state.p1Selected);
  if (state.mode !== 'sprint') {
    renderHand(elHandP2, state.p2Hand, 2, state.p2Selected);
  }

  updateHud();
  checkDeadlock();
}

function renderRecords() {
  const best = state.records.sprintBestMs !== null ? formatTime(state.records.sprintBestMs) : '—';
  elRecordsGrid.innerHTML = `
    <div class="record-card"><div class="record-label">Best Sprint</div><div class="record-value">${best}</div></div>
    <div class="record-card"><div class="record-label">Bot Wins</div><div class="record-value">${state.records.botWins}</div></div>
    <div class="record-card"><div class="record-label">Best Streak</div><div class="record-value">${state.records.bestStreak}</div></div>
    <div class="record-card"><div class="record-label">Cards Played</div><div class="record-value">${state.records.totalPlayed}</div></div>
  `;
}

function applySettingsToDom() {
  optSound.checked = state.settings.sound;
  for (const btn of document.querySelectorAll('.seg-btn[data-botspeed]')) {
    btn.setAttribute('aria-checked', String(btn.dataset.botspeed === state.settings.botSpeed));
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
elBtnNew.addEventListener('click', () => startGame(state.mode));
elBtnFlip.addEventListener('click', handleFlipPiles);
elPile0.addEventListener('click', () => handlePileTap(0));
elPile1.addEventListener('click', () => handlePileTap(1));

document.querySelectorAll('.seg-btn[data-mode]').forEach((btn) => {
  btn.addEventListener('click', () => startGame(btn.dataset.mode));
});

document.querySelectorAll('.seg-btn[data-botspeed]').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.settings.botSpeed = btn.dataset.botspeed;
    saveJson(STORAGE_SETTINGS, state.settings);
    applySettingsToDom();
  });
});

document.querySelectorAll('.seg-btn[data-scheme]').forEach((btn) => {
  btn.addEventListener('click', () => applyScheme(btn.dataset.scheme, true));
});

optSound.addEventListener('change', () => {
  state.settings.sound = optSound.checked;
  saveJson(STORAGE_SETTINGS, state.settings);
});

// Keyboard shortcuts: 1/2/3 to tap hand cards, Q/E for Left/Right pile, Space to Flip
window.addEventListener('keydown', (e) => {
  if (dialogRules.open || dialogSettings.open || dialogWin.open) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === '1' || k === '2' || k === '3') handleHandTap(1, Number(k) - 1);
  else if (k === 'q' || k === 'arrowleft') handlePileTap(0);
  else if (k === 'e' || k === 'arrowright') handlePileTap(1);
  else if (k === ' ' && !elBtnFlip.hidden) { e.preventDefault(); handleFlipPiles(); }
});

// Service Worker (skip inside offline Android APK host)
if ('serviceWorker' in navigator && location.hostname !== 'appassets.androidplatform.net') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// Boot
setupDialogs();
applyScheme(getStoredScheme(), false);
applySettingsToDom();
startGame('sprint');

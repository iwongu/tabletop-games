import {
  GRID_SIZE,
  WALL_N, WALL_E, WALL_S, WALL_W,
  DIR_N, DIR_E, DIR_S, DIR_W, DIR_NAMES,
  ROBOTS,
  slideRobot,
  solveOptimal,
  generatePuzzle,
  generateDailyPuzzle,
  getTodayKey,
} from './engine.js';

const STORAGE_KEYS = {
  theme: 'ricochet-color-scheme',
  sound: 'ricochet-sound',
  diff: 'ricochet-diff',
  solved: 'ricochet-endless-solved',
  dailyDone: 'ricochet-daily-done',
};

const DIFF_RANGES = {
  easy: { minPar: 3, maxPar: 5 },
  normal: { minPar: 5, maxPar: 8 },
  hard: { minPar: 7, maxPar: 10 },
};

const SHAPE_SVG = {
  circle: '<circle cx="12" cy="12" r="7"/>',
  square: '<rect x="5.5" y="5.5" width="13" height="13" rx="2.5"/>',
  triangle: '<polygon points="12,4 20.5,19 3.5,19"/>',
  star: '<polygon points="12,3 14.8,8.8 21,9.6 16.4,14 17.6,20.2 12,17.1 6.4,20.2 7.6,14 3,9.6 9.2,8.8"/>',
};

// State
const state = {
  mode: 'daily', // 'daily' | 'endless'
  difficulty: loadPref(STORAGE_KEYS.diff, 'normal'),
  sound: loadPref(STORAGE_KEYS.sound, 'true') !== 'false',
  solvedEndless: Number(loadPref(STORAGE_KEYS.solved, '0')) || 0,
  puzzle: null,
  positions: [0, 0, 0, 0],
  history: [], // stack of previous position arrays
  selectedRobot: 0,
  hintMove: null, // { robot, dir, to }
  won: false,
  demoTimer: null,
  isDemo: false,
};

// DOM refs
const boardWrap = document.getElementById('board-wrap');
const boardSvg = document.getElementById('board-svg');
const robotsLayer = document.getElementById('robots-layer');
const robotPicker = document.getElementById('robot-picker');
const movesVal = document.getElementById('moves-val');
const parVal = document.getElementById('par-val');
const solvedChip = document.getElementById('solved-chip');
const solvedVal = document.getElementById('solved-val');
const undoBtn = document.getElementById('undo-btn');
const hintBtn = document.getElementById('hint-btn');
const resetBtn = document.getElementById('reset-btn');
const rulesBtn = document.getElementById('rules-btn');
const settingsBtn = document.getElementById('settings-btn');
const newBtn = document.getElementById('new-btn');
const demoBtn = document.getElementById('demo-btn');
const toastEl = document.getElementById('toast');

const rulesDialog = document.getElementById('rules-dialog');
const settingsDialog = document.getElementById('settings-dialog');
const winDialog = document.getElementById('win-dialog');
const winBadge = document.getElementById('win-badge');
const winMoves = document.getElementById('win-moves');
const winPar = document.getElementById('win-par');
const winRetryBtn = document.getElementById('win-retry-btn');
const winWatchBtn = document.getElementById('win-watch-btn');
const winNextBtn = document.getElementById('win-next-btn');

const soundToggle = document.getElementById('sound-toggle');
const themeSeg = document.getElementById('theme-segmented');
const diffSeg = document.getElementById('diff-segmented');

let robotEls = [];
let toastTimer = null;
let audioCtx = null;

function loadPref(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

function savePref(key, val) {
  try {
    if (val === null) localStorage.removeItem(key);
    else localStorage.setItem(key, String(val));
  } catch {}
}

function playTone(freq, dur = 0.08, type = 'triangle', gainVal = 0.08) {
  if (!state.sound) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(gainVal, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + dur);
  } catch {}
}

function showToast(msg, ms = 2200) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms);
}

function stopDemo() {
  if (state.demoTimer) {
    clearTimeout(state.demoTimer);
    state.demoTimer = null;
  }
  state.isDemo = false;
  demoBtn.textContent = 'Watch';
}

/* ---------- Board Rendering ---------- */
function renderBoardStatic() {
  const { board, target } = state.puzzle;
  const targetRobot = ROBOTS[target.color];
  const CELL = 100;
  let svg = '';

  // Checkerboard subtle floor
  svg += '<g class="floor">';
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if ((r + c) % 2 === 1) {
        svg += `<rect x="${c * CELL}" y="${r * CELL}" width="${CELL}" height="${CELL}" fill="var(--board-cell-alt)"/>`;
      }
    }
  }
  svg += '</g>';

  // Grid lines
  svg += '<g stroke="var(--grid-line)" stroke-width="2">';
  for (let i = 1; i < GRID_SIZE; i++) {
    const p = i * CELL;
    svg += `<line x1="${p}" y1="0" x2="${p}" y2="1600"/>`;
    svg += `<line x1="0" y1="${p}" x2="1600" y2="${p}"/>`;
  }
  svg += '</g>';

  // Subtle decorative markers for non-active L-corners
  svg += '<g opacity="0.22">';
  for (const t of board.targets) {
    if (t.cell === target.cell) continue;
    const cx = t.c * CELL + 50;
    const cy = t.r * CELL + 50;
    const col = ROBOTS[t.color].color;
    svg += `<circle cx="${cx}" cy="${cy}" r="14" fill="${col}"/>`;
  }
  svg += '</g>';

  // Active Target Cell
  {
    const tx = target.c * CELL;
    const ty = target.r * CELL;
    svg += `<g class="active-target">
      <rect x="${tx + 6}" y="${ty + 6}" width="88" height="88" rx="16" fill="${targetRobot.color}" opacity="0.20"/>
      <rect class="target-pulse" x="${tx + 12}" y="${ty + 12}" width="76" height="76" rx="14" fill="none" stroke="${targetRobot.color}" stroke-width="6"/>
      <g transform="translate(${tx + 24}, ${ty + 24}) scale(2.16)" fill="${targetRobot.color}">${SHAPE_SVG[targetRobot.shape]}</g>
    </g>`;
  }

  // Center 2x2 Emblem showing target color & shape
  svg += `<g class="center-block">
    <rect x="700" y="700" width="200" height="200" fill="var(--center-bg)"/>
    <circle cx="800" cy="800" r="64" fill="${targetRobot.color}" opacity="0.18"/>
    <circle cx="800" cy="800" r="46" fill="${targetRobot.color}"/>
    <g transform="translate(766, 766) scale(2.83)" fill="#ffffff">${SHAPE_SVG[targetRobot.shape]}</g>
  </g>`;

  // Dynamic overlay group for slide guides + hint arrow
  svg += '<g id="guides-layer"></g>';

  // Walls (drawn last so they sit crisply on top)
  svg += '<g stroke="var(--wall-color)" stroke-width="14" stroke-linecap="round">';
  // Outer border
  svg += '<rect x="7" y="7" width="1586" height="1586" fill="none" stroke-width="14" rx="10"/>';
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const w = board.walls[r * GRID_SIZE + c];
      const x = c * CELL;
      const y = r * CELL;
      // Draw only S and E interior walls to avoid duplicates
      if (r < GRID_SIZE - 1 && (w & WALL_S)) {
        svg += `<line x1="${x}" y1="${y + CELL}" x2="${x + CELL}" y2="${y + CELL}"/>`;
      }
      if (c < GRID_SIZE - 1 && (w & WALL_E)) {
        svg += `<line x1="${x + CELL}" y1="${y}" x2="${x + CELL}" y2="${y + CELL}"/>`;
      }
    }
  }
  svg += '</g>';

  boardSvg.innerHTML = svg;
}

function renderGuides() {
  const guidesLayer = document.getElementById('guides-layer');
  if (!guidesLayer || !state.puzzle) return;

  const { board } = state.puzzle;
  const rIdx = state.selectedRobot;
  const rob = ROBOTS[rIdx];
  const start = state.positions[rIdx];
  const sr = start >> 4;
  const sc = start & 15;
  const sx = sc * 100 + 50;
  const sy = sr * 100 + 50;

  let html = '';

  // Show valid slide rays & destination dots for selected robot
  for (let dir = 0; dir < 4; dir++) {
    const dest = slideRobot(board, state.positions, rIdx, dir);
    if (dest === start) continue;

    const dr = dest >> 4;
    const dc = dest & 15;
    const dx = dc * 100 + 50;
    const dy = dr * 100 + 50;

    const isHint = state.hintMove && state.hintMove.robot === rIdx && state.hintMove.dir === dir;
    const strokeCol = isHint ? '#facc15' : rob.color;
    const strokeW = isHint ? 12 : 7;
    const op = isHint ? 0.95 : 0.42;

    html += `<line x1="${sx}" y1="${sy}" x2="${dx}" y2="${dy}" stroke="${strokeCol}" stroke-width="${strokeW}" stroke-dasharray="${isHint ? '22 12' : '14 14'}" stroke-linecap="round" opacity="${op}"/>`;
    html += `<circle class="dest-hit" data-dir="${dir}" cx="${dx}" cy="${dy}" r="${isHint ? 30 : 24}" fill="${strokeCol}" opacity="${isHint ? 0.92 : 0.55}"/>`;
    if (isHint) {
      html += `<circle cx="${dx}" cy="${dy}" r="40" fill="none" stroke="#facc15" stroke-width="6" class="target-pulse"/>`;
    }
  }

  guidesLayer.innerHTML = html;
}

function createRobotTokens() {
  robotsLayer.innerHTML = '';
  robotEls = ROBOTS.map((rob) => {
    const el = document.createElement('div');
    el.className = 'robot-token';
    el.dataset.robot = String(rob.id);
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', `${rob.name} robot`);
    el.innerHTML = `
      <div class="robot-body" style="background:${rob.color}">
        <svg viewBox="0 0 24 24" aria-hidden="true">${SHAPE_SVG[rob.shape]}</svg>
      </div>
    `;
    robotsLayer.appendChild(el);
    return el;
  });
}

function updateRobotPositions() {
  for (let i = 0; i < 4; i++) {
    const cell = state.positions[i];
    const r = cell >> 4;
    const c = cell & 15;
    const el = robotEls[i];
    el.style.transform = `translate(${c * 100}%, ${r * 100}%)`;
    el.classList.toggle('selected', i === state.selectedRobot);
    el.classList.toggle('hint-pulse', Boolean(state.hintMove && state.hintMove.robot === i));
  }
  renderGuides();
  updatePicker();
}

function buildPicker() {
  robotPicker.innerHTML = ROBOTS.map((rob) => `
    <button type="button" class="robot-chip" data-robot="${rob.id}" role="radio" aria-checked="false">
      <span class="chip-dot" style="background:${rob.color}">
        <svg viewBox="0 0 24 24" aria-hidden="true">${SHAPE_SVG[rob.shape]}</svg>
      </span>
      <span>${rob.name}</span>
    </button>
  `).join('');

  robotPicker.addEventListener('click', (e) => {
    const btn = e.target.closest('.robot-chip');
    if (!btn || state.isDemo) return;
    selectRobot(Number(btn.dataset.robot));
  });
}

function updatePicker() {
  const targetColor = state.puzzle ? state.puzzle.target.color : -1;
  for (const btn of robotPicker.querySelectorAll('.robot-chip')) {
    const id = Number(btn.dataset.robot);
    const sel = id === state.selectedRobot;
    btn.classList.toggle('selected', sel);
    btn.classList.toggle('is-target', id === targetColor);
    btn.setAttribute('aria-checked', String(sel));
  }
}

function updateHeader() {
  movesVal.textContent = String(state.history.length);
  parVal.textContent = state.puzzle ? String(state.puzzle.par) : '–';
  undoBtn.disabled = state.history.length === 0 || state.isDemo;

  const isEndless = state.mode === 'endless';
  solvedChip.hidden = !isEndless;
  newBtn.hidden = !isEndless;
  solvedVal.textContent = String(state.solvedEndless);

  for (const pill of document.querySelectorAll('.mode-pills .pill')) {
    const active = pill.dataset.mode === state.mode;
    pill.classList.toggle('active', active);
    pill.setAttribute('aria-selected', String(active));
  }
}

/* ---------- Gameplay Actions ---------- */
function selectRobot(id) {
  if (state.selectedRobot === id) return;
  state.selectedRobot = id;
  playTone(520, 0.04, 'sine', 0.04);
  updateRobotPositions();
}

function moveRobot(robotIdx, dir, fromDemo = false) {
  if (!state.puzzle || (state.won && !fromDemo)) return false;
  const dest = slideRobot(state.puzzle.board, state.positions, robotIdx, dir);
  if (dest === state.positions[robotIdx]) {
    if (!fromDemo) playTone(160, 0.07, 'sawtooth', 0.04);
    return false;
  }

  state.history.push([...state.positions]);
  state.positions[robotIdx] = dest;
  state.selectedRobot = robotIdx;
  state.hintMove = null;

  playTone(340 + robotIdx * 65, 0.07, 'triangle', 0.07);
  updateRobotPositions();
  updateHeader();

  // Check victory
  if (!fromDemo && state.positions[state.puzzle.target.color] === state.puzzle.target.cell) {
    handleWin();
  }
  return true;
}

function handleWin() {
  state.won = true;
  const moves = state.history.length;
  const par = state.puzzle.par;

  // Victory chime
  playTone(523.25, 0.12, 'triangle', 0.09);
  setTimeout(() => playTone(659.25, 0.12, 'triangle', 0.09), 90);
  setTimeout(() => playTone(783.99, 0.22, 'triangle', 0.1), 180);

  if (state.mode === 'endless') {
    state.solvedEndless += 1;
    savePref(STORAGE_KEYS.solved, state.solvedEndless);
  } else {
    savePref(STORAGE_KEYS.dailyDone, getTodayKey());
  }
  updateHeader();

  winMoves.textContent = String(moves);
  winPar.textContent = String(par);
  if (moves <= par) {
    winBadge.textContent = '★ Optimal Par Master!';
  } else if (moves <= par + 2) {
    winBadge.textContent = 'Great Solve!';
  } else {
    winBadge.textContent = 'Target Reached!';
  }
  winNextBtn.textContent = state.mode === 'daily' ? 'Play Endless' : 'Next Puzzle';

  setTimeout(() => {
    if (!winDialog.open) winDialog.showModal();
  }, 240);
}

function undoMove() {
  if (state.history.length === 0 || state.isDemo) return;
  state.positions = state.history.pop();
  state.won = false;
  state.hintMove = null;
  playTone(260, 0.06, 'sine', 0.05);
  updateRobotPositions();
  updateHeader();
}

function resetPuzzle() {
  stopDemo();
  if (!state.puzzle) return;
  state.positions = [...state.puzzle.startPositions];
  state.history = [];
  state.won = false;
  state.hintMove = null;
  state.selectedRobot = state.puzzle.target.color;
  updateRobotPositions();
  updateHeader();
}

function requestHint() {
  if (!state.puzzle || state.won || state.isDemo) return;

  // Solve from current board state first
  const sol = solveOptimal(
    state.puzzle.board,
    state.positions,
    state.puzzle.target.color,
    state.puzzle.target.cell,
    { maxDepth: 9, maxStates: 60000 }
  );

  if (sol && sol.moves.length > 0) {
    const next = sol.moves[0];
    state.hintMove = next;
    state.selectedRobot = next.robot;
    updateRobotPositions();
    showToast(`Hint: Slide ${ROBOTS[next.robot].name} ${DIR_NAMES[next.dir]} (${sol.par} left)`);
    playTone(680, 0.08, 'sine', 0.06);
  } else {
    showToast('Off optimal track — tap ↻ Reset for a fresh start!');
  }
}

function watchOptimalDemo() {
  if (!state.puzzle) return;
  if (state.isDemo) {
    stopDemo();
    return;
  }
  resetPuzzle();
  state.isDemo = true;
  demoBtn.textContent = 'Stop';
  const moves = state.puzzle.solution;
  let step = 0;

  const tick = () => {
    if (!state.isDemo || step >= moves.length) {
      stopDemo();
      if (step >= moves.length) showToast(`Optimal Par: ${moves.length} moves`);
      return;
    }
    const m = moves[step++];
    moveRobot(m.robot, m.dir, true);
    state.demoTimer = setTimeout(tick, 520);
  };
  state.demoTimer = setTimeout(tick, 320);
}

function loadPuzzle(mode = state.mode) {
  stopDemo();
  state.mode = mode;
  if (mode === 'daily') {
    state.puzzle = generateDailyPuzzle();
  } else {
    const range = DIFF_RANGES[state.difficulty] || DIFF_RANGES.normal;
    state.puzzle = generatePuzzle(range);
  }
  state.positions = [...state.puzzle.startPositions];
  state.history = [];
  state.won = false;
  state.hintMove = null;
  state.selectedRobot = state.puzzle.target.color;

  renderBoardStatic();
  updateRobotPositions();
  updateHeader();
}

/* ---------- Pointer (Tap & Swipe) + Keyboard Input ---------- */
let dragState = null;

function clientToCell(clientX, clientY) {
  const rect = boardWrap.getBoundingClientRect();
  const c = Math.floor(((clientX - rect.left) / rect.width) * GRID_SIZE);
  const r = Math.floor(((clientY - rect.top) / rect.height) * GRID_SIZE);
  if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return null;
  return { r, c, cell: r * GRID_SIZE + c };
}

boardWrap.addEventListener('pointerdown', (e) => {
  if (state.isDemo || state.won) return;
  const info = clientToCell(e.clientX, e.clientY);
  if (!info) return;

  const hitRobot = state.positions.indexOf(info.cell);
  if (hitRobot !== -1) {
    selectRobot(hitRobot);
    dragState = {
      pointerId: e.pointerId,
      robot: hitRobot,
      startX: e.clientX,
      startY: e.clientY,
      swiped: false,
    };
    boardWrap.setPointerCapture(e.pointerId);
    return;
  }

  // Otherwise, check if tapping along selected robot's row or column to slide
  const cur = state.positions[state.selectedRobot];
  const sr = cur >> 4;
  const sc = cur & 15;
  if (info.r === sr && info.c !== sc) {
    moveRobot(state.selectedRobot, info.c > sc ? DIR_E : DIR_W);
  } else if (info.c === sc && info.r !== sr) {
    moveRobot(state.selectedRobot, info.r > sr ? DIR_S : DIR_N);
  }
});

boardWrap.addEventListener('pointermove', (e) => {
  if (!dragState || dragState.swiped || e.pointerId !== dragState.pointerId) return;
  const dx = e.clientX - dragState.startX;
  const dy = e.clientY - dragState.startY;
  const dist = Math.hypot(dx, dy);
  if (dist < 18) return;

  dragState.swiped = true;
  let dir;
  if (Math.abs(dx) > Math.abs(dy)) {
    dir = dx > 0 ? DIR_E : DIR_W;
  } else {
    dir = dy > 0 ? DIR_S : DIR_N;
  }
  moveRobot(dragState.robot, dir);
});

boardWrap.addEventListener('pointerup', () => { dragState = null; });
boardWrap.addEventListener('pointercancel', () => { dragState = null; });

window.addEventListener('keydown', (e) => {
  if (rulesDialog.open || settingsDialog.open || winDialog.open || state.isDemo) return;
  const k = e.key.toLowerCase();
  if (k === 'arrowup' || k === 'w') { e.preventDefault(); moveRobot(state.selectedRobot, DIR_N); }
  else if (k === 'arrowright' || k === 'd') { e.preventDefault(); moveRobot(state.selectedRobot, DIR_E); }
  else if (k === 'arrowdown' || k === 's') { e.preventDefault(); moveRobot(state.selectedRobot, DIR_S); }
  else if (k === 'arrowleft' || k === 'a') { e.preventDefault(); moveRobot(state.selectedRobot, DIR_W); }
  else if (k === '1' || k === 'r') selectRobot(0);
  else if (k === '2' || k === 'b') selectRobot(1);
  else if (k === '3' || k === 'g') selectRobot(2);
  else if (k === '4' || k === 'y') selectRobot(3);
  else if (k === 'z') undoMove();
  else if (k === 'h') requestHint();
});

/* ---------- Theme, Settings & Dialog Fallbacks ---------- */
function applyTheme(choice) {
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (choice === 'system') {
    savePref(STORAGE_KEYS.theme, null);
    meta.content = 'light dark';
  } else {
    savePref(STORAGE_KEYS.theme, choice);
    meta.content = choice;
  }
  for (const btn of themeSeg.querySelectorAll('.seg-btn')) {
    btn.classList.toggle('active', btn.dataset.theme === choice);
  }
}

function initThemeUI() {
  const stored = loadPref(STORAGE_KEYS.theme, null);
  const current = stored === 'light' || stored === 'dark' ? stored : 'system';
  for (const btn of themeSeg.querySelectorAll('.seg-btn')) {
    btn.classList.toggle('active', btn.dataset.theme === current);
  }
}

function initDiffUI() {
  for (const btn of diffSeg.querySelectorAll('.seg-btn')) {
    btn.classList.toggle('active', btn.dataset.diff === state.difficulty);
  }
}

// Light-dismiss fallback for browsers without <dialog closedby="any">
if (!('closedBy' in HTMLDialogElement.prototype)) {
  const outside = (e, dialog) => {
    const r = dialog.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  for (const dialog of document.querySelectorAll('dialog[closedby="any"]')) {
    let pressedOutside = false;
    dialog.addEventListener('pointerdown', (e) => { pressedOutside = outside(e, dialog); });
    dialog.addEventListener('pointerup', (e) => {
      if (pressedOutside && outside(e, dialog)) dialog.close();
    });
  }
}

/* ---------- Wire UI Controls ---------- */
for (const pill of document.querySelectorAll('.mode-pills .pill')) {
  pill.addEventListener('click', () => {
    if (pill.dataset.mode !== state.mode) loadPuzzle(pill.dataset.mode);
  });
}

undoBtn.addEventListener('click', undoMove);
hintBtn.addEventListener('click', requestHint);
resetBtn.addEventListener('click', resetPuzzle);
newBtn.addEventListener('click', () => loadPuzzle('endless'));
demoBtn.addEventListener('click', watchOptimalDemo);

rulesBtn.addEventListener('click', () => rulesDialog.showModal());
settingsBtn.addEventListener('click', () => settingsDialog.showModal());

themeSeg.addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn');
  if (btn) applyTheme(btn.dataset.theme);
});

diffSeg.addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn');
  if (!btn) return;
  state.difficulty = btn.dataset.diff;
  savePref(STORAGE_KEYS.diff, state.difficulty);
  initDiffUI();
  if (state.mode === 'endless') loadPuzzle('endless');
});

soundToggle.checked = state.sound;
soundToggle.addEventListener('change', () => {
  state.sound = soundToggle.checked;
  savePref(STORAGE_KEYS.sound, state.sound);
});

winRetryBtn.addEventListener('click', () => {
  winDialog.close();
  resetPuzzle();
});
winWatchBtn.addEventListener('click', () => {
  winDialog.close();
  watchOptimalDemo();
});
winNextBtn.addEventListener('click', () => {
  winDialog.close();
  loadPuzzle('endless');
});

window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEYS.theme) initThemeUI();
});

// Service Worker (skip inside offline Android WebView)
if ('serviceWorker' in navigator && location.hostname !== 'appassets.androidplatform.net') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Boot
createRobotTokens();
buildPicker();
initThemeUI();
initDiffUI();
loadPuzzle('daily');

/**
 * Ricochet Robots — Board, Movement & Exact Optimal BFS Solver
 *
 * Authentic 16x16 walled board built from 4 rotatable classic quadrants,
 * with a 2x2 center block, outer walls, edge bumpers, and 16 L-shaped
 * target corners. Uses a fast bit-packed BFS solver (with helper-robot
 * symmetry canonicalization) to guarantee exact optimal Par move counts
 * and live optimal hints.
 */

export const GRID_SIZE = 16;
export const CELL_COUNT = GRID_SIZE * GRID_SIZE; // 256

// Wall bitmasks per cell
export const WALL_N = 1;
export const WALL_E = 2;
export const WALL_S = 4;
export const WALL_W = 8;

// Direction indices
export const DIR_N = 0;
export const DIR_E = 1;
export const DIR_S = 2;
export const DIR_W = 3;

export const DIR_NAMES = ['Up', 'Right', 'Down', 'Left'];
export const DIR_WALLS = [WALL_N, WALL_E, WALL_S, WALL_W];
export const DIR_DR = [-1, 0, 1, 0];
export const DIR_DC = [0, 1, 0, -1];
export const DIR_DELTA = [-GRID_SIZE, 1, GRID_SIZE, -1];

export const ROBOTS = [
  { id: 0, name: 'Red',    key: 'red',    shape: 'circle',   color: '#ef4444', light: '#fca5a5' },
  { id: 1, name: 'Blue',   key: 'blue',   shape: 'square',   color: '#3b82f6', light: '#93c5fd' },
  { id: 2, name: 'Green',  key: 'green',  shape: 'triangle', color: '#10b981', light: '#6ee7b7' },
  { id: 3, name: 'Yellow', key: 'yellow', shape: 'star',     color: '#f59e0b', light: '#fcd34d' },
];

// Center 2x2 blocked cells: (7,7), (7,8), (8,7), (8,8)
export const CENTER_CELLS = new Set([
  7 * 16 + 7,
  7 * 16 + 8,
  8 * 16 + 7,
  8 * 16 + 8,
]);

/**
 * Deterministic PRNG (Mulberry32) for seeded Daily puzzles and reproducible boards.
 */
export function createRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function getTodayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 4 classic 8x8 quadrant templates (authored in top-left orientation: rows 0..7, cols 0..7).
 * Each quadrant has:
 *  - topBumperCol: vertical wall on right edge of (0, col)
 *  - leftBumperRow: horizontal wall on bottom edge of (row, 0)
 *  - corners: 4 L-shaped target bumpers { r, c, walls: [DIR_x, DIR_y], color: 0..3 }
 *    Note: cell (7,7) is always the center block corner.
 */
const QUADRANT_TEMPLATES = [
  {
    topBumperCol: 4,
    leftBumperRow: 5,
    corners: [
      { r: 1, c: 2, walls: WALL_N | WALL_E, color: 0 },
      { r: 2, c: 6, walls: WALL_S | WALL_E, color: 1 },
      { r: 4, c: 1, walls: WALL_S | WALL_W, color: 2 },
      { r: 6, c: 4, walls: WALL_N | WALL_W, color: 3 },
    ],
  },
  {
    topBumperCol: 3,
    leftBumperRow: 4,
    corners: [
      { r: 1, c: 5, walls: WALL_N | WALL_W, color: 1 },
      { r: 3, c: 2, walls: WALL_S | WALL_E, color: 3 },
      { r: 5, c: 6, walls: WALL_N | WALL_E, color: 0 },
      { r: 6, c: 1, walls: WALL_S | WALL_W, color: 2 },
    ],
  },
  {
    topBumperCol: 5,
    leftBumperRow: 3,
    corners: [
      { r: 1, c: 3, walls: WALL_S | WALL_W, color: 2 },
      { r: 2, c: 5, walls: WALL_N | WALL_E, color: 3 },
      { r: 4, c: 2, walls: WALL_N | WALL_W, color: 0 },
      { r: 6, c: 5, walls: WALL_S | WALL_E, color: 1 },
    ],
  },
  {
    topBumperCol: 2,
    leftBumperRow: 6,
    corners: [
      { r: 1, c: 4, walls: WALL_S | WALL_E, color: 3 },
      { r: 3, c: 6, walls: WALL_N | WALL_W, color: 2 },
      { r: 4, c: 3, walls: WALL_S | WALL_W, color: 1 },
      { r: 5, c: 1, walls: WALL_N | WALL_E, color: 0 },
    ],
  },
];

function rotateWallsCW(mask, times) {
  let m = mask;
  for (let i = 0; i < times; i++) {
    let next = 0;
    if (m & WALL_N) next |= WALL_E;
    if (m & WALL_E) next |= WALL_S;
    if (m & WALL_S) next |= WALL_W;
    if (m & WALL_W) next |= WALL_N;
    m = next;
  }
  return m;
}

function rotateCoordCW(r, c, times) {
  let nr = r;
  let nc = c;
  for (let i = 0; i < times; i++) {
    const tmp = nr;
    nr = nc;
    nc = 15 - tmp;
  }
  return [nr, nc];
}

function addWall(walls, r, c, dirMask) {
  if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return;
  const idx = r * GRID_SIZE + c;
  walls[idx] |= dirMask;
  if ((dirMask & WALL_N) && r > 0) walls[(r - 1) * GRID_SIZE + c] |= WALL_S;
  if ((dirMask & WALL_S) && r < GRID_SIZE - 1) walls[(r + 1) * GRID_SIZE + c] |= WALL_N;
  if ((dirMask & WALL_W) && c > 0) walls[r * GRID_SIZE + (c - 1)] |= WALL_E;
  if ((dirMask & WALL_E) && c < GRID_SIZE - 1) walls[r * GRID_SIZE + (c + 1)] |= WALL_W;
}

/**
 * Build a 16x16 board by shuffling the 4 classic quadrants into the 4 corners
 * (TL=0 rot, TR=1 rot CW, BR=2 rot CW, BL=3 rot CW).
 */
export function buildBoard(rng) {
  const walls = new Uint8Array(CELL_COUNT);
  const targets = [];

  // 1. Outer perimeter walls
  for (let i = 0; i < GRID_SIZE; i++) {
    walls[i] |= WALL_N;
    walls[(GRID_SIZE - 1) * GRID_SIZE + i] |= WALL_S;
    walls[i * GRID_SIZE] |= WALL_W;
    walls[i * GRID_SIZE + (GRID_SIZE - 1)] |= WALL_E;
  }

  // 2. Center 2x2 block walls (cells (7,7), (7,8), (8,7), (8,8))
  addWall(walls, 7, 7, WALL_N | WALL_W);
  addWall(walls, 7, 8, WALL_N | WALL_E);
  addWall(walls, 8, 7, WALL_S | WALL_W);
  addWall(walls, 8, 8, WALL_S | WALL_E);

  // 3. Shuffle the 4 quadrants
  const order = [0, 1, 2, 3];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  for (let q = 0; q < 4; q++) {
    const tpl = QUADRANT_TEMPLATES[order[q]];
    const rot = q; // 0=TL, 1=TR, 2=BR, 3=BL

    // Top edge bumper: wall on East side of (0, topBumperCol)
    {
      const [nr, nc] = rotateCoordCW(0, tpl.topBumperCol, rot);
      addWall(walls, nr, nc, rotateWallsCW(WALL_E, rot));
    }
    // Left edge bumper: wall on South side of (leftBumperRow, 0)
    {
      const [nr, nc] = rotateCoordCW(tpl.leftBumperRow, 0, rot);
      addWall(walls, nr, nc, rotateWallsCW(WALL_S, rot));
    }

    // 4 L-shaped target corners
    for (const corner of tpl.corners) {
      const [nr, nc] = rotateCoordCW(corner.r, corner.c, rot);
      const nw = rotateWallsCW(corner.walls, rot);
      addWall(walls, nr, nc, nw);
      targets.push({
        cell: nr * GRID_SIZE + nc,
        r: nr,
        c: nc,
        color: corner.color,
      });
    }
  }

  // 4. Precompute static wall slide destinations: slideTable[dir * 256 + cell]
  const slideTable = new Uint8Array(4 * CELL_COUNT);
  for (let dir = 0; dir < 4; dir++) {
    const wMask = DIR_WALLS[dir];
    const delta = DIR_DELTA[dir];
    const base = dir * CELL_COUNT;
    for (let cell = 0; cell < CELL_COUNT; cell++) {
      let cur = cell;
      while ((walls[cur] & wMask) === 0) {
        cur += delta;
      }
      slideTable[base + cell] = cur;
    }
  }

  return { walls, targets, slideTable };
}

/**
 * Compute destination cell when robot `robotIdx` slides in direction `dir`
 * given current 4-robot positions array `[p0, p1, p2, p3]`.
 */
export function slideRobot(board, positions, robotIdx, dir) {
  const start = positions[robotIdx];
  let end = board.slideTable[dir * CELL_COUNT + start];
  if (end === start) return start;

  // Check if any of the other 3 robots sits strictly between start and end (inclusive of end)
  const sr = start >> 4;
  const sc = start & 15;

  if (dir === DIR_N) {
    let minR = end >> 4;
    for (let i = 0; i < 4; i++) {
      if (i === robotIdx) continue;
      const p = positions[i];
      if ((p & 15) === sc) {
        const pr = p >> 4;
        if (pr < sr && pr >= minR) minR = pr + 1;
      }
    }
    return (minR << 4) | sc;
  }
  if (dir === DIR_S) {
    let maxR = end >> 4;
    for (let i = 0; i < 4; i++) {
      if (i === robotIdx) continue;
      const p = positions[i];
      if ((p & 15) === sc) {
        const pr = p >> 4;
        if (pr > sr && pr <= maxR) maxR = pr - 1;
      }
    }
    return (maxR << 4) | sc;
  }
  if (dir === DIR_W) {
    let minC = end & 15;
    for (let i = 0; i < 4; i++) {
      if (i === robotIdx) continue;
      const p = positions[i];
      if ((p >> 4) === sr) {
        const pc = p & 15;
        if (pc < sc && pc >= minC) minC = pc + 1;
      }
    }
    return (sr << 4) | minC;
  }
  // DIR_E
  let maxC = end & 15;
  for (let i = 0; i < 4; i++) {
    if (i === robotIdx) continue;
    const p = positions[i];
    if ((p >> 4) === sr) {
      const pc = p & 15;
      if (pc > sc && pc <= maxC) maxC = pc - 1;
    }
  }
  return (sr << 4) | maxC;
}

/**
 * Pack 4 positions into a canonical 32-bit key where `targetRobot` is in byte 3,
 * and the 3 helper robots are sorted ascending in bytes 2, 1, 0.
 * Sorting helpers reduces BFS state space by up to 6x!
 */
function packCanonical(p0, p1, p2, p3, targetRobot) {
  let t, a, b, c;
  if (targetRobot === 0)      { t = p0; a = p1; b = p2; c = p3; }
  else if (targetRobot === 1) { t = p1; a = p0; b = p2; c = p3; }
  else if (targetRobot === 2) { t = p2; a = p0; b = p1; c = p3; }
  else                        { t = p3; a = p0; b = p1; c = p2; }

  // 3-element sorting network
  if (a > b) { const tmp = a; a = b; b = tmp; }
  if (b > c) { const tmp = b; b = c; c = tmp; }
  if (a > b) { const tmp = a; a = b; b = tmp; }

  return ((t << 24) | (a << 16) | (b << 8) | c) >>> 0;
}

function packExact(p0, p1, p2, p3) {
  return ((p0 << 24) | (p1 << 16) | (p2 << 8) | p3) >>> 0;
}

/**
 * Exact Breadth-First Search solver.
 * Finds the shortest sequence of moves to bring `targetRobot` onto `targetCell`.
 *
 * Returns `{ moves: Array<{robot, dir, from, to}>, par: number, statesExplored: number }`
 * or `null` if no solution exists within `maxDepth` / `maxStates`.
 */
export function solveOptimal(board, startPositions, targetRobot, targetCell, opts = {}) {
  const maxDepth = opts.maxDepth ?? 10;
  const maxStates = opts.maxStates ?? 120000;

  if (startPositions[targetRobot] === targetCell) {
    return { moves: [], par: 0, statesExplored: 1 };
  }

  const slideTable = board.slideTable;
  const visited = new Set();

  // Parallel typed arrays for fast BFS queue + path reconstruction
  const qExact = new Uint32Array(maxStates);
  const qParent = new Int32Array(maxStates);
  const qMove = new Uint16Array(maxStates); // (robot << 2) | dir
  const qDepth = new Uint8Array(maxStates);

  const initKey = packCanonical(
    startPositions[0], startPositions[1], startPositions[2], startPositions[3], targetRobot
  );
  visited.add(initKey);

  qExact[0] = packExact(startPositions[0], startPositions[1], startPositions[2], startPositions[3]);
  qParent[0] = -1;
  qMove[0] = 0;
  qDepth[0] = 0;

  let head = 0;
  let tail = 1;
  const pos = [0, 0, 0, 0];

  while (head < tail) {
    const curExact = qExact[head];
    const curDepth = qDepth[head];

    if (curDepth >= maxDepth) {
      head++;
      continue;
    }

    pos[0] = (curExact >>> 24) & 255;
    pos[1] = (curExact >>> 16) & 255;
    pos[2] = (curExact >>> 8) & 255;
    pos[3] = curExact & 255;

    const nextDepth = curDepth + 1;

    for (let r = 0; r < 4; r++) {
      const start = pos[r];
      const sr = start >> 4;
      const sc = start & 15;

      for (let dir = 0; dir < 4; dir++) {
        let end = slideTable[dir * CELL_COUNT + start];
        if (end === start) continue;

        // Clamp against other 3 robots inline for max speed
        if (dir === DIR_N) {
          let minR = end >> 4;
          for (let i = 0; i < 4; i++) {
            if (i === r) continue;
            const p = pos[i];
            if ((p & 15) === sc) {
              const pr = p >> 4;
              if (pr < sr && pr >= minR) minR = pr + 1;
            }
          }
          end = (minR << 4) | sc;
        } else if (dir === DIR_S) {
          let maxR = end >> 4;
          for (let i = 0; i < 4; i++) {
            if (i === r) continue;
            const p = pos[i];
            if ((p & 15) === sc) {
              const pr = p >> 4;
              if (pr > sr && pr <= maxR) maxR = pr - 1;
            }
          }
          end = (maxR << 4) | sc;
        } else if (dir === DIR_W) {
          let minC = end & 15;
          for (let i = 0; i < 4; i++) {
            if (i === r) continue;
            const p = pos[i];
            if ((p >> 4) === sr) {
              const pc = p & 15;
              if (pc < sc && pc >= minC) minC = pc + 1;
            }
          }
          end = (sr << 4) | minC;
        } else {
          let maxC = end & 15;
          for (let i = 0; i < 4; i++) {
            if (i === r) continue;
            const p = pos[i];
            if ((p >> 4) === sr) {
              const pc = p & 15;
              if (pc > sc && pc <= maxC) maxC = pc - 1;
            }
          }
          end = (sr << 4) | maxC;
        }

        if (end === start) continue;

        const np0 = r === 0 ? end : pos[0];
        const np1 = r === 1 ? end : pos[1];
        const np2 = r === 2 ? end : pos[2];
        const np3 = r === 3 ? end : pos[3];

        // Goal check!
        if (r === targetRobot && end === targetCell) {
          // Reconstruct path
          const moves = [{ robot: r, dir, from: start, to: end }];
          let trace = head;
          while (qParent[trace] !== -1) {
            const m = qMove[trace];
            const mr = m >> 2;
            const md = m & 3;
            const pExact = qExact[qParent[trace]];
            const cExact = qExact[trace];
            const shift = (3 - mr) * 8;
            moves.push({
              robot: mr,
              dir: md,
              from: (pExact >>> shift) & 255,
              to: (cExact >>> shift) & 255,
            });
            trace = qParent[trace];
          }
          moves.reverse();
          return { moves, par: moves.length, statesExplored: tail };
        }

        if (nextDepth >= maxDepth) continue;

        const key = packCanonical(np0, np1, np2, np3, targetRobot);
        if (visited.has(key)) continue;

        if (tail >= maxStates) {
          return null; // Budget exceeded
        }

        visited.add(key);
        qExact[tail] = packExact(np0, np1, np2, np3);
        qParent[tail] = head;
        qMove[tail] = (r << 2) | dir;
        qDepth[tail] = nextDepth;
        tail++;
      }
    }
    head++;
  }

  return null;
}

/**
 * Generate a verified, interesting puzzle with optimal Par in [minPar, maxPar].
 */
export function generatePuzzle(opts = {}) {
  const seed = opts.seed ?? (Date.now() ^ (Math.random() * 0xffffffff));
  const minPar = opts.minPar ?? 5;
  const maxPar = opts.maxPar ?? 8;
  const rng = createRng(seed);

  for (let boardAttempt = 0; boardAttempt < 8; boardAttempt++) {
    const board = buildBoard(rng);

    for (let setupAttempt = 0; setupAttempt < 40; setupAttempt++) {
      // Pick random target from the 16 L-corners
      const target = board.targets[Math.floor(rng() * board.targets.length)];

      // Place 4 distinct robots outside center 2x2 and not on target
      const positions = [];
      const used = new Set(CENTER_CELLS);
      used.add(target.cell);

      while (positions.length < 4) {
        const cell = Math.floor(rng() * CELL_COUNT);
        if (!used.has(cell)) {
          used.add(cell);
          positions.push(cell);
        }
      }

      const sol = solveOptimal(board, positions, target.color, target.cell, {
        maxDepth: maxPar,
        maxStates: 45000,
      });

      if (sol && sol.par >= minPar && sol.par <= maxPar) {
        return {
          seed,
          board,
          target,
          startPositions: positions,
          par: sol.par,
          solution: sol.moves,
        };
      }
    }
  }

  // Fallback with wider par range (guaranteed fast)
  const board = buildBoard(rng);
  for (let i = 0; i < 60; i++) {
    const target = board.targets[Math.floor(rng() * board.targets.length)];
    const positions = [];
    const used = new Set(CENTER_CELLS);
    used.add(target.cell);
    while (positions.length < 4) {
      const cell = Math.floor(rng() * CELL_COUNT);
      if (!used.has(cell)) {
        used.add(cell);
        positions.push(cell);
      }
    }
    const sol = solveOptimal(board, positions, target.color, target.cell, {
      maxDepth: 7,
      maxStates: 30000,
    });
    if (sol && sol.par >= 3) {
      return {
        seed,
        board,
        target,
        startPositions: positions,
        par: sol.par,
        solution: sol.moves,
      };
    }
  }

  throw new Error('Failed to generate Ricochet Robots puzzle');
}

export function generateDailyPuzzle(dateKey = getTodayKey()) {
  const seed = hashString(`ricochet-robots-daily-${dateKey}`);
  return {
    ...generatePuzzle({ seed, minPar: 5, maxPar: 8 }),
    dateKey,
  };
}

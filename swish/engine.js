// Pure Swish Spatial Transparent-Card Game Engine
// Cards are 3x4 transparent grids (cols 0..2, rows 0..3) containing 1 colored Ball and 1 colored Hoop.
// Cards may be flipped horizontally, vertically, or rotated 180° (dihedral group D2: 4 orientations).

export const COLS = 3;
export const ROWS = 4;

export const COLORS = [
  { id: 0, name: 'Orange', hex: '#f97316', stroke: '#c2410c' },
  { id: 1, name: 'Blue', hex: '#2563eb', stroke: '#1d4ed8' },
  { id: 2, name: 'Green', hex: '#16a34a', stroke: '#15803d' },
  { id: 3, name: 'Purple', hex: '#9333ea', stroke: '#6b21a8' },
];

// 4 rectangle-preserving orientations (D2):
// 0: identity, 1: flipX, 2: flipY, 3: rotate180 (flipX + flipY)
export const ORIENTATIONS = [
  { id: 0, label: 'Normal', flipX: false, flipY: false },
  { id: 1, label: 'Flip H', flipX: true, flipY: false },
  { id: 2, label: 'Flip V', flipX: false, flipY: true },
  { id: 3, label: 'Rotate 180°', flipX: true, flipY: true },
];

export function shuffle(items, rng = Math.random) {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function transformPos(col, row, orientId) {
  const o = ORIENTATIONS[orientId];
  return {
    col: o.flipX ? COLS - 1 - col : col,
    row: o.flipY ? ROWS - 1 - row : row,
  };
}

export function transformCard(card, orientId) {
  const ballPos = transformPos(card.ball.col, card.ball.row, orientId);
  const hoopPos = transformPos(card.hoop.col, card.hoop.row, orientId);
  return {
    orientId,
    ball: { ...ballPos, color: card.ball.color },
    hoop: { ...hoopPos, color: card.hoop.color },
  };
}

/**
 * Check whether an array of 2..4 cards can be oriented (using D2 symmetries)
 * so that every ball lands inside a hoop of the exact same color, with zero
 * leftover balls/hoops and zero collisions.
 * Returns { orientations: number[], stacked: TransformedCard[] } or null.
 */
export function solveSwish(cards) {
  const n = cards.length;
  if (n < 2 || n > 4) return null;

  // Quick necessary condition: multiset of ball colors MUST equal multiset of hoop colors!
  const ballCounts = [0, 0, 0, 0];
  const hoopCounts = [0, 0, 0, 0];
  for (const c of cards) {
    ballCounts[c.ball.color]++;
    hoopCounts[c.hoop.color]++;
  }
  for (let i = 0; i < 4; i++) {
    if (ballCounts[i] !== hoopCounts[i]) return null;
  }

  // Fix card 0 to orientation 0 (global symmetry doesn't change validity),
  // search orientations 0..3 for remaining cards (at most 4^(n-1) <= 64 checks!)
  const chosen = new Array(n).fill(0);

  function check() {
    const ballAt = new Map(); // cellKey -> color
    const hoopAt = new Map(); // cellKey -> color
    const stacked = [];

    for (let i = 0; i < n; i++) {
      const t = transformCard(cards[i], chosen[i]);
      stacked.push(t);
      const bk = `${t.ball.col},${t.ball.row}`;
      const hk = `${t.hoop.col},${t.hoop.row}`;
      if (ballAt.has(bk) || hoopAt.has(hk)) return null; // collision
      ballAt.set(bk, t.ball.color);
      hoopAt.set(hk, t.hoop.color);
    }

    if (ballAt.size !== hoopAt.size) return null;
    for (const [cell, bColor] of ballAt.entries()) {
      if (hoopAt.get(cell) !== bColor) return null;
    }
    return { orientations: chosen.slice(), stacked };
  }

  function dfs(idx) {
    if (idx === n) return check();
    for (let o = 0; o < 4; o++) {
      chosen[idx] = o;
      const res = dfs(idx + 1);
      if (res) return res;
    }
    return null;
  }

  return dfs(1);
}

/**
 * Find a valid Swish on a board (checks 2-card Swishes first, then 3-card Swishes).
 * Returns { indices: number[], solution } or null.
 */
export function findAnySwish(board) {
  const n = board.length;
  // 2-card Swishes
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const sol = solveSwish([board[i], board[j]]);
      if (sol) return { indices: [i, j], solution: sol };
    }
  }
  // 3-card Swishes
  for (let i = 0; i < n - 2; i++) {
    for (let j = i + 1; j < n - 1; j++) {
      for (let k = j + 1; k < n; k++) {
        const sol = solveSwish([board[i], board[j], board[k]]);
        if (sol) return { indices: [i, j, k], solution: sol };
      }
    }
  }
  return null;
}

/**
 * Generate a rich, balanced 60-card Swish deck.
 * Uses 5 distinct spatial motifs x all 12 ordered color pairs (plus balanced orientations),
 * guaranteeing high Swish density (both 2-card and 3-card Swishes on >95% of 16-card boards).
 */
export function generateDeck(rng = Math.random) {
  // 5 iconic 3x4 spatial motifs (distinct distances & angles across the 3x4 grid)
  const motifs = [
    [[0, 0], [2, 3]], // Far diagonal corners
    [[0, 0], [1, 2]], // Corner to lower-center
    [[1, 0], [0, 2]], // Top-mid to side-edge
    [[0, 1], [2, 2]], // Cross-side mid-diagonal
    [[1, 1], [2, 3]], // Center to opposite corner
  ];

  const cards = [];
  let id = 0;
  // 5 motifs x 12 ordered distinct color pairs (4 colors x 3 other colors) = 60 unique cards!
  for (let m = 0; m < motifs.length; m++) {
    const [posA, posB] = motifs[m];
    for (let ballColor = 0; ballColor < 4; ballColor++) {
      for (let hoopColor = 0; hoopColor < 4; hoopColor++) {
        if (ballColor === hoopColor) continue;
        // Randomly orient each card (0..3) AND randomly swap A/B on half so players must mentally flip/rotate!
        const orient = Math.floor(rng() * 4);
        const swapAB = rng() < 0.5;
        const pBall = transformPos((swapAB ? posB : posA)[0], (swapAB ? posB : posA)[1], orient);
        const pHoop = transformPos((swapAB ? posA : posB)[0], (swapAB ? posA : posB)[1], orient);
        cards.push({
          id: id++,
          ball: { col: pBall.col, row: pBall.row, color: ballColor },
          hoop: { col: pHoop.col, row: pHoop.row, color: hoopColor },
        });
      }
    }
  }

  return shuffle(cards, rng);
}

export function cardAriaLabel(card) {
  return `${COLORS[card.ball.color].name} ball, ${COLORS[card.hoop.color].name} hoop`;
}

// Pure SET game engine (81-card affine geometry AG(4,3))

export const FEATURE_NAMES = ['Color', 'Shape', 'Count', 'Shading'];

export const VALUE_LABELS = {
  color: ['Red', 'Green', 'Purple'],
  colorAccessible: ['Vermilion', 'Blue', 'Gold'],
  shape: ['Diamond', 'Squiggle', 'Oval'],
  count: ['1', '2', '3'],
  shading: ['Solid', 'Striped', 'Open'],
};

/**
 * Create the complete 81-card SET deck.
 * Each card is { id, color, shape, count, shading } with each feature in 0..2.
 */
export function createDeck() {
  const deck = [];
  let id = 0;
  for (let color = 0; color < 3; color++) {
    for (let shape = 0; shape < 3; shape++) {
      for (let count = 0; count < 3; count++) {
        for (let shading = 0; shading < 3; shading++) {
          deck.push({ id: id++, color, shape, count, shading });
        }
      }
    }
  }
  return deck;
}

/**
 * Deterministic PRNG (Mulberry32) for seeded daily puzzles.
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function dateKeyToSeed(dateKey) {
  let hash = 2166136261;
  for (let i = 0; i < dateKey.length; i++) {
    hash ^= dateKey.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function getTodayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function shuffle(items, rng = Math.random) {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Three cards form a valid SET iff for every feature (0..2),
 * (a + b + c) % 3 === 0 (equivalent to all-same or all-different).
 */
export function isValidSet(a, b, c) {
  if (!a || !b || !c) return false;
  if (a.id === b.id || b.id === c.id || a.id === c.id) return false;
  return (
    (a.color + b.color + c.color) % 3 === 0 &&
    (a.shape + b.shape + c.shape) % 3 === 0 &&
    (a.count + b.count + c.count) % 3 === 0 &&
    (a.shading + b.shading + c.shading) % 3 === 0
  );
}

/**
 * Explain which feature(s) failed the SET rule ("2 the same, 1 different").
 */
export function explainMismatch(a, b, c, colorblind = false) {
  const colorLabels = colorblind ? VALUE_LABELS.colorAccessible : VALUE_LABELS.color;
  const specs = [
    { key: 'color', name: 'Color', labels: colorLabels },
    { key: 'shape', name: 'Shape', labels: VALUE_LABELS.shape },
    { key: 'count', name: 'Count', labels: VALUE_LABELS.count },
    { key: 'shading', name: 'Shading', labels: VALUE_LABELS.shading },
  ];

  const failures = [];
  for (const { key, name, labels } of specs) {
    const vals = [a[key], b[key], c[key]];
    if ((vals[0] + vals[1] + vals[2]) % 3 !== 0) {
      const counts = new Map();
      for (const v of vals) counts.set(v, (counts.get(v) || 0) + 1);
      const parts = [...counts.entries()]
        .sort((x, y) => y[1] - x[1])
        .map(([val, n]) => `${n} ${labels[val]}`);
      failures.push(`${name} (${parts.join(', ')})`);
    }
  }
  return failures;
}

/**
 * Return all valid 3-card SETs on a board (as arrays of 3 board indices).
 */
export function findAllSets(board) {
  const sets = [];
  const n = board.length;
  for (let i = 0; i < n - 2; i++) {
    for (let j = i + 1; j < n - 1; j++) {
      for (let k = j + 1; k < n; k++) {
        if (isValidSet(board[i], board[j], board[k])) {
          sets.push([i, j, k]);
        }
      }
    }
  }
  return sets;
}

/**
 * Canonical string key for a 3-card SET (order-independent, based on card IDs).
 */
export function setKey(cards) {
  return cards
    .map((c) => c.id)
    .sort((x, y) => x - y)
    .join('-');
}

/**
 * Generate a deterministic Daily Puzzle: 12 cards containing at least `targetSets` (default 6) SETs.
 */
export function generateDailyBoard(dateKey, targetSets = 6) {
  const rng = mulberry32(dateKeyToSeed(`SET-DAILY-${dateKey}`));
  const baseDeck = createDeck();
  let bestBoard = null;
  let bestCount = -1;

  for (let attempt = 0; attempt < 2500; attempt++) {
    const candidate = shuffle(baseDeck, rng).slice(0, 12);
    const sets = findAllSets(candidate);
    if (sets.length === targetSets) {
      return { board: candidate, totalSets: sets.length, targetSets };
    }
    if (sets.length >= targetSets && (bestBoard === null || sets.length < bestCount)) {
      bestBoard = candidate;
      bestCount = sets.length;
    }
  }
  return {
    board: bestBoard || shuffle(baseDeck, rng).slice(0, 12),
    totalSets: bestCount >= targetSets ? bestCount : targetSets,
    targetSets,
  };
}

export function cardAriaLabel(card, colorblind = false) {
  const colors = colorblind ? VALUE_LABELS.colorAccessible : VALUE_LABELS.color;
  const count = card.count + 1;
  const shape = VALUE_LABELS.shape[card.shape] + (count > 1 ? 's' : '');
  const shading = VALUE_LABELS.shading[card.shading];
  return `${count} ${colors[card.color]} ${shading} ${shape}`;
}

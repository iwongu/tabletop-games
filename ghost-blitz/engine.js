// Pure Ghost Blitz (Geistesblitz) Game Engine
// 5 iconic items, each with a unique shape and unique true color.
// Every valid card shows 2 distinct shapes in 2 distinct colors with EXACTLY ONE unique answer.

export const ITEMS = [
  { id: 0, key: 'ghost', name: 'Ghost', colorName: 'White', colorHex: '#f8fafc', strokeHex: '#475569' },
  { id: 1, key: 'bottle', name: 'Bottle', colorName: 'Green', colorHex: '#16a34a', strokeHex: '#14532d' },
  { id: 2, key: 'chair', name: 'Chair', colorName: 'Red', colorHex: '#dc2626', strokeHex: '#7f1d1d' },
  { id: 3, key: 'book', name: 'Book', colorName: 'Blue', colorHex: '#2563eb', strokeHex: '#1e3a8a' },
  { id: 4, key: 'mouse', name: 'Mouse', colorName: 'Grey', colorHex: '#6b7280', strokeHex: '#1f2937' },
];

export function shuffle(items, rng = Math.random) {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Evaluate a card with 2 drawings: [{ shapeId, colorId }, { shapeId, colorId }].
 * Returns { answerId, type: 'exact' | 'absent', reason } or null if invalid/ambiguous.
 */
export function solveCard(drawings) {
  if (!drawings || drawings.length !== 2) return null;
  const [a, b] = drawings;
  if (a.shapeId === b.shapeId || a.colorId === b.colorId) return null;

  const exactMatches = drawings.filter((d) => d.shapeId === d.colorId);
  if (exactMatches.length === 1) {
    const item = ITEMS[exactMatches[0].shapeId];
    return {
      answerId: item.id,
      type: 'exact',
      reason: `${item.colorName} ${item.name} is in its true color!`,
    };
  }
  if (exactMatches.length > 1) return null; // Ambiguous

  // Neither is in its true color: find items whose shape AND color are BOTH absent
  const used = new Set([a.shapeId, a.colorId, b.shapeId, b.colorId]);
  const absent = ITEMS.filter((it) => !used.has(it.id));
  if (absent.length !== 1) return null; // Must be strictly 1 unique answer

  const item = absent[0];
  return {
    answerId: item.id,
    type: 'absent',
    reason: `Neither ${item.name} nor ${item.colorName} appears on the card!`,
  };
}

/**
 * Generate the full valid Ghost Blitz 60-card deck:
 * - 30 Exact-Match cards (1 item in true color, 1 decoy item in a wrong color)
 * - 30 Elimination cards (neither item in true color; 4 distinct traits shown, 1 unique item absent)
 * Total = 60 balanced, unambiguous cards.
 */
export function generateDeck(rng = Math.random) {
  const exactPool = [];
  const absentPool = [];

  // Enumerate all ordered/unordered pairs of distinct shapes & distinct colors
  for (let s1 = 0; s1 < 5; s1++) {
    for (let s2 = s1 + 1; s2 < 5; s2++) {
      for (let c1 = 0; c1 < 5; c1++) {
        for (let c2 = 0; c2 < 5; c2++) {
          if (c1 === c2) continue;
          const drawings = [
            { shapeId: s1, colorId: c1 },
            { shapeId: s2, colorId: c2 },
          ];
          const sol = solveCard(drawings);
          if (!sol) continue;
          const card = {
            drawings: rng() < 0.5 ? drawings : [drawings[1], drawings[0]],
            ...sol,
          };
          if (sol.type === 'exact') exactPool.push(card);
          else absentPool.push(card);
        }
      }
    }
  }

  // Exact pool has 60 possible cards (5 answers * 4 decoy shapes * 3 decoy colors = 60)
  // Absent pool has 60 possible cards (5 missing * 3*2 ways to pair remaining 4 traits = 60)
  // Sample 30 balanced exact + 30 balanced absent = authentic 60-card Ghost Blitz deck!
  const deck = [
    ...shuffle(exactPool, rng).slice(0, 30),
    ...shuffle(absentPool, rng).slice(0, 30),
  ];

  return shuffle(deck, rng).map((card, idx) => ({ id: idx, ...card }));
}

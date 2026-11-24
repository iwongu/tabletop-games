// Pure Blink Card Game Engine
// 60 unique cards across 6 colors, 6 shapes, and 5 counts (1..5).
// Two cards match if they share Color OR Shape OR Count.

export const COLORS = [
  { id: 0, name: 'Red', hex: '#dc2626' },
  { id: 1, name: 'Blue', hex: '#2563eb' },
  { id: 2, name: 'Green', hex: '#16a34a' },
  { id: 3, name: 'Yellow', hex: '#d97706' },
  { id: 4, name: 'Purple', hex: '#7c3aed' },
  { id: 5, name: 'Black', hex: '#1e293b' },
];

export const SHAPES = [
  { id: 0, key: 'star', name: 'Star' },
  { id: 1, key: 'triangle', name: 'Triangle' },
  { id: 2, key: 'moon', name: 'Moon' },
  { id: 3, key: 'cross', name: 'Cross' },
  { id: 4, key: 'bolt', name: 'Lightning' },
  { id: 5, key: 'diamond', name: 'Diamond' },
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
 * Generate a balanced 60-card Blink deck:
 * - Exactly 10 cards of each of the 6 colors
 * - Exactly 10 cards of each of the 6 shapes
 * - Exactly 12 cards of each of the 5 counts (1..5)
 * - All 60 (color, shape, count) combinations unique
 */
export function generateDeck(rng = Math.random) {
  const cards = [];
  let id = 0;
  // 6 colors x 5 counts x 2 distinct shapes per (color, count) = 60 unique balanced cards
  for (let c = 0; c < 6; c++) {
    for (let cnt = 1; cnt <= 5; cnt++) {
      const s1 = (c + cnt - 1) % 6;
      const s2 = (c + cnt + 2) % 6;
      cards.push({ id: id++, color: c, shape: s1, count: cnt });
      cards.push({ id: id++, color: c, shape: s2, count: cnt });
    }
  }
  return shuffle(cards, rng);
}

/**
 * Return matching attributes between two cards (array of 'Color' | 'Shape' | 'Count').
 * Empty array means NOT a valid play.
 */
export function getMatchReasons(card, pileTop) {
  if (!card || !pileTop) return [];
  const reasons = [];
  if (card.color === pileTop.color) reasons.push(COLORS[card.color].name);
  if (card.shape === pileTop.shape) reasons.push(SHAPES[card.shape].name);
  if (card.count === pileTop.count) reasons.push(String(card.count));
  return reasons;
}

export function canPlayOn(card, pileTop) {
  if (!card || !pileTop) return false;
  return card.color === pileTop.color || card.shape === pileTop.shape || card.count === pileTop.count;
}

/**
 * Return all valid moves [{ handIndex, pileIndex }] for a hand against 2 center piles.
 */
export function findValidMoves(hand, piles) {
  const moves = [];
  for (let h = 0; h < hand.length; h++) {
    const card = hand[h];
    if (!card) continue;
    for (let p = 0; p < piles.length; p++) {
      if (canPlayOn(card, piles[p])) {
        moves.push({ handIndex: h, pileIndex: p });
      }
    }
  }
  return moves;
}

export function cardAriaLabel(card) {
  const shapeName = SHAPES[card.shape].name;
  const plural = card.count > 1 ? (shapeName.endsWith('s') ? 'es' : 's') : '';
  return `${card.count} ${COLORS[card.color].name} ${shapeName}${plural}`;
}

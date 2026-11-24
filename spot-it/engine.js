// Pure Spot It! (Dobble) Projective Plane Engine
// Generates mathematically exact finite projective planes PG(2, n) for prime order n.

export const DIFFICULTIES = {
  easy: { id: 'easy', label: 'Easy', order: 3, symbolsPerCard: 4, deckSize: 13 },
  medium: { id: 'medium', label: 'Medium', order: 5, symbolsPerCard: 6, deckSize: 31 },
  classic: { id: 'classic', label: 'Classic', order: 7, symbolsPerCard: 8, deckSize: 57 },
};

// 57 hand-curated, high-contrast, silhouette-distinct single-codepoint emojis (no ZWJ sequences)
export const SYMBOLS = [
  { id: 0, glyph: '🍎', name: 'Apple' },
  { id: 1, glyph: '🍌', name: 'Banana' },
  { id: 2, glyph: '🍇', name: 'Grapes' },
  { id: 3, glyph: '🍉', name: 'Watermelon' },
  { id: 4, glyph: '🍕', name: 'Pizza' },
  { id: 5, glyph: '🍩', name: 'Donut' },
  { id: 6, glyph: '🍦', name: 'Ice Cream' },
  { id: 7, glyph: '🥨', name: 'Pretzel' },
  { id: 8, glyph: '🥕', name: 'Carrot' },
  { id: 9, glyph: '🍄', name: 'Mushroom' },
  { id: 10, glyph: '🌵', name: 'Cactus' },
  { id: 11, glyph: '🌻', name: 'Sunflower' },
  { id: 12, glyph: '🍀', name: 'Clover' },
  { id: 13, glyph: '🍁', name: 'Maple Leaf' },
  { id: 14, glyph: '🐶', name: 'Dog' },
  { id: 15, glyph: '🐱', name: 'Cat' },
  { id: 16, glyph: '🦊', name: 'Fox' },
  { id: 17, glyph: '🐼', name: 'Panda' },
  { id: 18, glyph: '🐸', name: 'Frog' },
  { id: 19, glyph: '🐙', name: 'Octopus' },
  { id: 20, glyph: '🐢', name: 'Turtle' },
  { id: 21, glyph: '🦋', name: 'Butterfly' },
  { id: 22, glyph: '🐝', name: 'Bee' },
  { id: 23, glyph: '🦖', name: 'Dino' },
  { id: 24, glyph: '🦄', name: 'Unicorn' },
  { id: 25, glyph: '🐳', name: 'Whale' },
  { id: 26, glyph: '🦩', name: 'Flamingo' },
  { id: 27, glyph: '🦉', name: 'Owl' },
  { id: 28, glyph: '⚡', name: 'Lightning' },
  { id: 29, glyph: '🔥', name: 'Fire' },
  { id: 30, glyph: '💧', name: 'Droplet' },
  { id: 31, glyph: '🌈', name: 'Rainbow' },
  { id: 32, glyph: '🌙', name: 'Moon' },
  { id: 33, glyph: '⭐', name: 'Star' },
  { id: 34, glyph: '⛄', name: 'Snowman' },
  { id: 35, glyph: '🎈', name: 'Balloon' },
  { id: 36, glyph: '🎁', name: 'Gift' },
  { id: 37, glyph: '👑', name: 'Crown' },
  { id: 38, glyph: '💎', name: 'Gem' },
  { id: 39, glyph: '🔑', name: 'Key' },
  { id: 40, glyph: '🔔', name: 'Bell' },
  { id: 41, glyph: '⏰', name: 'Clock' },
  { id: 42, glyph: '💡', name: 'Lightbulb' },
  { id: 43, glyph: '🧲', name: 'Magnet' },
  { id: 44, glyph: '🎸', name: 'Guitar' },
  { id: 45, glyph: '🎺', name: 'Trumpet' },
  { id: 46, glyph: '🎯', name: 'Bullseye' },
  { id: 47, glyph: '🎲', name: 'Dice' },
  { id: 48, glyph: '🧩', name: 'Puzzle' },
  { id: 49, glyph: '🚀', name: 'Rocket' },
  { id: 50, glyph: '🚗', name: 'Car' },
  { id: 51, glyph: '🚲', name: 'Bicycle' },
  { id: 52, glyph: '⛵', name: 'Sailboat' },
  { id: 53, glyph: '⚓', name: 'Anchor' },
  { id: 54, glyph: '🧭', name: 'Compass' },
  { id: 55, glyph: '👻', name: 'Ghost' },
  { id: 56, glyph: '🤖', name: 'Robot' },
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
 * Generate the complete finite projective plane PG(2, n) for any prime n.
 * Produces n^2 + n + 1 cards, each with n + 1 symbol indices in 0..(n^2 + n),
 * with the guarantee that ANY two distinct cards share EXACTLY ONE symbol.
 */
export function generateProjectiveDeck(order, rng = Math.random) {
  const n = order;
  const totalSymbols = n * n + n + 1;
  const cards = [];

  // Card 0: line at infinity [0, 1, ..., n]
  const firstCard = [];
  for (let i = 0; i <= n; i++) firstCard.push(i);
  cards.push(firstCard);

  // Next n cards: vertical lines through point 0
  for (let j = 0; j < n; j++) {
    const card = [0];
    for (let k = 0; k < n; k++) {
      card.push(n + 1 + j * n + k);
    }
    cards.push(card);
  }

  // Remaining n^2 cards: lines of slope i (0..n-1) and intercept j (0..n-1)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const card = [i + 1];
      for (let k = 0; k < n; k++) {
        const y = (i * k + j) % n;
        card.push(n + 1 + k * n + y);
      }
      cards.push(card);
    }
  }

  // Randomly map abstract symbol IDs onto our curated SYMBOLS catalog
  const palette = shuffle(SYMBOLS, rng).slice(0, totalSymbols);

  return shuffle(
    cards.map((symIndices, idx) => ({
      id: idx,
      symbols: shuffle(
        symIndices.map((s) => palette[s]),
        rng
      ),
    })),
    rng
  );
}

/**
 * Find the single shared symbol between two cards (returns symbol object or null).
 */
export function findMatch(cardA, cardB) {
  if (!cardA || !cardB) return null;
  const setA = new Set(cardA.symbols.map((s) => s.id));
  for (const sym of cardB.symbols) {
    if (setA.has(sym.id)) return sym;
  }
  return null;
}

/**
 * Generate authentic Spot It! (Dobble) circular packing with bold 3.5x+ size contrast:
 * 1-2 jumbo icons (~32% of card diameter), medium icons (~18-22%), and tiny sneaky
 * icons (~8.5-10.5%), tightly & organically packed with zero overlap or rim clipping.
 * Returns { symbol, x, y, sizePct, rot } where x, y, sizePct are in % of card diameter (1:1 with CSS cqi).
 */
export function layoutCardSymbols(symbols, rng = Math.random) {
  const k = symbols.length;

  // Exact diameter tiers in % of card diameter (cqi) — ~3.5x–3.8x linear ratio (~12x–14x area!)
  const diameterTiers = {
    4: [38, 28, 20, 12.5],
    6: [35, 28, 22, 17, 13, 9.5],
    8: [32, 26.5, 21.5, 18, 15, 12.5, 10.2, 8.4],
  };
  const baseSizes = diameterTiers[k] || Array.from({ length: k }, (_, i) => 30 - (i / k) * 21);
  const sizes = shuffle(
    baseSizes.map((s) => s * (0.96 + rng() * 0.08)),
    rng
  );

  // Clean ~5% breathing margin inside the circular rim so symbols spread widely without touching the border
  const maxOuter = 44.8;
  const pad = k === 8 ? 4.4 : k === 6 ? 5.6 : 7.0;

  const ordered = symbols.map((symbol, idx) => ({
    symbol,
    sizePct: sizes[idx],
    r: sizes[idx] * 0.48,
    isAnchor: false,
    rot: Math.floor(rng() * 360),
    x: 50,
    y: 50,
  }));

  // Seed placement: 1 anchor near center, remaining symbols pushed right out to the perimeter
  const bySize = [...ordered].sort((a, b) => b.sizePct - a.sizePct);
  const baseAngle = rng() * Math.PI * 2;

  if (k === 4) {
    bySize.forEach((item, i) => {
      const a = baseAngle + (i * Math.PI) / 2 + (rng() - 0.5) * 0.28;
      const dist = maxOuter - item.r;
      item.x = 50 + Math.cos(a) * dist;
      item.y = 50 + Math.sin(a) * dist;
    });
  } else {
    const anchorIdx = rng() < 0.6 ? 0 : Math.min(2, bySize.length - 1);
    const anchor = bySize[anchorIdx];
    anchor.isAnchor = true;
    const ca = rng() * Math.PI * 2;
    const cr = 3 + rng() * 6;
    anchor.x = 50 + Math.cos(ca) * cr;
    anchor.y = 50 + Math.sin(ca) * cr;

    const rest = bySize.filter((_, idx) => idx !== anchorIdx);
    const ring = [];
    let lo = 0;
    let hi = rest.length - 1;
    while (lo <= hi) {
      ring.push(rest[lo++]);
      if (lo <= hi) ring.push(rest[hi--]);
    }
    const step = (Math.PI * 2) / ring.length;
    ring.forEach((item, i) => {
      const a = baseAngle + i * step + (rng() - 0.5) * 0.2;
      const dist = maxOuter - item.r;
      item.x = 50 + Math.cos(a) * dist;
      item.y = 50 + Math.sin(a) * dist;
    });
  }

  // Relaxation with gentle outward spread so outer symbols hug the rim with zero overlaps
  for (let iter = 0; iter < 80; iter++) {
    // Gentle outward push on outer-ring symbols during first half of relaxation
    if (iter < 40) {
      for (let i = 0; i < k; i++) {
        const item = ordered[i];
        if (item.isAnchor) continue;
        const dx = item.x - 50;
        const dy = item.y - 50;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.01) {
          item.x += (dx / dist) * 0.65;
          item.y += (dy / dist) * 0.65;
        }
      }
    }

    // Pairwise separation
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        const a = ordered[i];
        const b = ordered[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        const minDist = a.r + b.r + pad;
        if (dist < minDist) {
          if (dist < 0.01) {
            dx = 1;
            dy = 0;
            dist = 1;
          }
          const push = (minDist - dist) * 0.55;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        }
      }
    }

    // Clamp cleanly inside circular card rim
    for (let i = 0; i < k; i++) {
      const item = ordered[i];
      const dx = item.x - 50;
      const dy = item.y - 50;
      const dist = Math.hypot(dx, dy);
      const limit = maxOuter - item.r;
      if (dist > limit && dist > 0.01) {
        item.x = 50 + (dx / dist) * limit;
        item.y = 50 + (dy / dist) * limit;
      }
    }
  }

  return ordered.map(({ symbol, x, y, sizePct, rot }) => ({ symbol, x, y, sizePct, rot }));
}

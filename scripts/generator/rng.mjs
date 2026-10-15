// Seeded random numbers. Pure: no Foundry globals.
//
// A recipe stores one seed string. Each decision draws from a *forked* stream named after what it decides
// ("slot:prefix", "param:flaming.element"), so rerolling one property never shifts the others.

/** xmur3 string hash → 32-bit seed generator. */
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

/** mulberry32: small, fast, good enough for loot. Returns floats in [0, 1). */
function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // no look-alikes (l, o, 0, 1)

/** A new human-readable seed, e.g. "k7mq-x2ra". Uses the platform RNG only to pick the seed itself. */
export function newSeed(random = Math.random) {
  const part = () => Array.from({ length: 4 }, () => SEED_ALPHABET[Math.floor(random() * SEED_ALPHABET.length)]).join("");
  return `${part()}-${part()}`;
}

const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** A 16-character Foundry-style id derived from a string, so recompiling a recipe keeps ids stable. */
export function stableId(str) {
  const next = mulberry32(xmur3(`id:${str}`)());
  let out = "";
  for (let i = 0; i < 16; i++) out += ID_ALPHABET[Math.floor(next() * ID_ALPHABET.length)];
  return out;
}

export class Rng {
  /** @param {string} seed */
  constructor(seed) {
    if (typeof seed !== "string" || !seed.length) throw new Error("Rng needs a non-empty seed string");
    this.seed = seed;
    this._next = mulberry32(xmur3(seed)());
  }

  /** An independent stream for one named decision. Same seed + label → same stream. */
  fork(label) {
    return new Rng(`${this.seed}/${label}`);
  }

  /** Float in [0, 1). */
  next() {
    return this._next();
  }

  /** Integer in [min, max], inclusive. */
  int(min, max) {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) throw new Error(`Bad range ${min}..${max}`);
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** One element of a non-empty array, uniformly. */
  pick(arr) {
    if (!Array.isArray(arr) || !arr.length) throw new Error("pick() needs a non-empty array");
    return arr[Math.floor(this.next() * arr.length)];
  }

  /**
   * One element, weighted. `weightOf` returns a non-negative number; zero-weight entries are never chosen.
   * Returns null if nothing has positive weight.
   */
  weighted(arr, weightOf = (x) => x.weight ?? 1) {
    const weights = arr.map((x) => Math.max(0, Number(weightOf(x)) || 0));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return null;
    let r = this.next() * total;
    for (let i = 0; i < arr.length; i++) {
      if (weights[i] === 0) continue;
      r -= weights[i];
      if (r < 0) return arr[i];
    }
    return arr.findLast((_, i) => weights[i] > 0);
  }
}

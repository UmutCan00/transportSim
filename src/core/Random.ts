/**
 * Seeded pseudo-random number generator (mulberry32).
 * Deterministic: same seed always produces same sequence.
 */
export class Random {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0;
  }

  /** Returns a float in [0, 1) */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns an integer in [min, max) */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min)) + min;
  }

  /** Returns a float in [min, max) */
  float(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }
}

/** Generate a seed from a string (simple hash) */
export function seedFromString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return hash;
}

/** Generate a random seed */
export function randomSeed(): number {
  return (Math.random() * 2147483647) | 0;
}

export type RNG = () => number;

export function makeRng(seed: number): RNG {
  let state = seed | 0;
  if (state === 0) {
    state = 0x9e3779b9;
  }
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    // Convert to unsigned and scale to [0, 1)
    return ((state >>> 0) & 0xffffffff) / 0x100000000;
  };
}

export function nextInt(rng: RNG, maxExclusive: number): number {
  return Math.floor(rng() * maxExclusive);
}

export function serializeSeed(seed: number): number {
  return seed >>> 0;
}

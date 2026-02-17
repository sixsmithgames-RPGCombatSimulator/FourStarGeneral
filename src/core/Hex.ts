export type Axial = {
  q: number;
  r: number;
};

export const axialDirections: readonly Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 }
] as const;

export function neighbors(hex: Axial): Axial[] {
  return axialDirections.map((dir) => ({ q: hex.q + dir.q, r: hex.r + dir.r }));
}

export function hexDistance(a: Axial, b: Axial): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  const ds = (a.q + a.r) - (b.q + b.r);
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds));
}

export function add(a: Axial, b: Axial): Axial {
  return { q: a.q + b.q, r: a.r + b.r };
}

export function subtract(a: Axial, b: Axial): Axial {
  return { q: a.q - b.q, r: a.r - b.r };
}

export function equals(a: Axial, b: Axial): boolean {
  return a.q === b.q && a.r === b.r;
}

export function axialKey(h: Axial): string {
  return `${h.q},${h.r}`;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function hexLerp(a: Axial, b: Axial, t: number): { x: number; y: number; z: number } {
  const ax = a.q;
  const ay = -a.q - a.r;
  const az = a.r;
  const bx = b.q;
  const by = -b.q - b.r;
  const bz = b.r;
  return {
    x: lerp(ax, bx, t),
    y: lerp(ay, by, t),
    z: lerp(az, bz, t)
  };
}

export function roundCube(x: number, y: number, z: number): Axial {
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);

  const xDiff = Math.abs(rx - x);
  const yDiff = Math.abs(ry - y);
  const zDiff = Math.abs(rz - z);

  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz;
  } else if (yDiff > zDiff) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }

  return { q: rx, r: rz };
}

export function hexLine(a: Axial, b: Axial): Axial[] {
  const distance = hexDistance(a, b);
  const results: Axial[] = [];
  for (let i = 0; i <= distance; i += 1) {
    const t = distance === 0 ? 0 : i / distance;
    const cube = hexLerp(a, b, t);
    results.push(roundCube(cube.x, cube.y, cube.z));
  }
  return results;
}

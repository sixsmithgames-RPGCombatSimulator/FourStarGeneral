import type { Axial } from "../../core/Hex";

/** Preserve every committed waypoint while using the screen's existing bounds/coordinate conversion. */
export function buildMovementPresentationPath(
  path: readonly Axial[] | undefined,
  fromKey: string,
  toKey: string,
  toHexKey: (hex: Axial) => string | null
): string[] {
  const keys: string[] = [];
  const appendKey = (key: string | null): void => {
    if (!key || keys[keys.length - 1] === key) return;
    keys.push(key);
  };
  appendKey(fromKey);
  path?.forEach((hex) => appendKey(toHexKey(hex)));
  appendKey(toKey);
  return keys;
}

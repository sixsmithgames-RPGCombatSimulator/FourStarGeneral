export function buildCapacityAwareMovementBlockers(
  occupiedHexKeys: ReadonlySet<string>,
  canEnterHexKey: (hexKey: string) => boolean
): Set<string> {
  return new Set([...occupiedHexKeys].filter((hexKey) => !canEnterHexKey(hexKey)));
}

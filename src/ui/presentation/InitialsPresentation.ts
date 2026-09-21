/** Produces the stable two-character fallback used by roster and portrait tiles. */
export function extractDisplayInitials(name: string): string {
  return name
    .split(" ")
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("")
    .padEnd(2, "?")
    .slice(0, 2);
}

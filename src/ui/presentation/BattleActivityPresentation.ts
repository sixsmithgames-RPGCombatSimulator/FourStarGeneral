import type { ActivityDetailSection } from "../announcements/AnnouncementTypes";
import { formatReadinessValue } from "./BattleDamagePresentation";

function formatActivityDetailLabel(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatActivityDetailValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "-";
    return Number.isInteger(value) ? value.toString() : formatReadinessValue(value);
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    if (value.length === 0) return "-";
    const joined = value.map((entry) => formatActivityDetailValue(entry)).join(", ");
    return joined.length > 280 ? `${joined.slice(0, 277)}...` : joined;
  }
  try {
    const json = JSON.stringify(value);
    if (!json) return "-";
    return json.length > 280 ? `${json.slice(0, 277)}...` : json;
  } catch {
    return String(value);
  }
}

export function buildGenericActivityDetailSections(
  details: Readonly<Record<string, unknown>> | undefined
): readonly ActivityDetailSection[] | undefined {
  if (!details) return undefined;
  const entries = Object.entries(details)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ({
      label: formatActivityDetailLabel(key),
      value: formatActivityDetailValue(value)
    }));
  return entries.length > 0 ? [{ title: "Technical Data", entries }] : undefined;
}

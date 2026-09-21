import {
  CAMPAIGN_SEGMENT_HOURS,
  SEGMENTS_PER_DAY,
  type CampaignHistoricalCalendar
} from "../../core/campaignTypes";
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
] as const;

export interface CampaignSegmentTimePresentation {
  readonly day: number;
  readonly dayLabel: string;
  readonly timeLabel: string;
  readonly displayLabel: string;
}

function formatHour(hour: number): string {
  return hour.toString().padStart(2, "0");
}

function parseHistoricalStartDate(startDateIso: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDateIso);
  if (!match) {
    throw new Error(`Invalid historical campaign date '${startDateIso}': expected YYYY-MM-DD.`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const result = new Date(Date.UTC(year, month, day));
  if (result.getUTCFullYear() !== year || result.getUTCMonth() !== month || result.getUTCDate() !== day) {
    throw new Error(`Historical campaign date '${startDateIso}' does not exist.`);
  }
  return result;
}

/** Canonical deterministic projection for campaign segment clock and calendar copy. */
export function formatCampaignSegmentTime(
  segment: number,
  calendar?: CampaignHistoricalCalendar | null
): CampaignSegmentTimePresentation {
  if (!Number.isSafeInteger(segment) || segment < 0) {
    throw new Error(`Invalid campaign segment '${segment}': expected a non-negative safe integer.`);
  }
  const dayIndex = Math.floor(segment / SEGMENTS_PER_DAY);
  const day = dayIndex + 1;
  const startHour = (segment % SEGMENTS_PER_DAY) * CAMPAIGN_SEGMENT_HOURS;
  const endHour = startHour + CAMPAIGN_SEGMENT_HOURS;
  const timeLabel = `${formatHour(startHour)}:00–${formatHour(endHour)}:00`;
  if (!calendar) {
    const dayLabel = `Day ${day}`;
    return Object.freeze({ day, dayLabel, timeLabel, displayLabel: `${dayLabel}, ${timeLabel.replace("–", "-")}` });
  }

  const startDate = parseHistoricalStartDate(calendar.startDateIso);
  const displayDate = new Date(startDate.getTime() + dayIndex * 24 * 60 * 60 * 1000);
  const operationDay = calendar.operationDayOffset + dayIndex;
  const operationDayLabel = operationDay === 0 ? "D-Day" : operationDay > 0 ? `D+${operationDay}` : `D${operationDay}`;
  const dateLabel = `${displayDate.getUTCDate()} ${MONTH_NAMES[displayDate.getUTCMonth()]} ${displayDate.getUTCFullYear()}`;
  const dayLabel = `${operationDayLabel} · ${dateLabel}`;
  return Object.freeze({ day, dayLabel, timeLabel, displayLabel: `${dayLabel}, ${timeLabel}` });
}

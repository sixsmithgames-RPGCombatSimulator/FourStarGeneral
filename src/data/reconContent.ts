/**
 * Stub data module providing a placeholder structure for recon popup content.
 * Replace with real recon intelligence data once available.
 */
export interface ReconContentEntry {
  /** Short label for the recon item, e.g., sector or operation name. */
  label: string;
  /** HTML body fragment displayed inside the recon popup. */
  bodyHtml: string;
}

/**
 * Development-time recon content list used by `PopupManager`.
 * Populate with actual recon reports when the data source exists.
 */
export const reconContentEntries: ReconContentEntry[] = [];

/** Responsive accessibility manager for campaign workspace and inspector sheets. */

import type { CampaignCommandUIStateSnapshot } from "../CampaignCommandUIState";

/**
 * CSS moves campaign regions off-canvas at compact widths; this manager mirrors that visual state into
 * the accessibility and interaction trees so hidden controls cannot receive focus.
 */
export class CampaignCompactSheetManager {
  private state: CampaignCommandUIStateSnapshot | null = null;
  private listening = false;
  private readonly onResize = (): void => this.apply();

  public constructor(private readonly root: HTMLElement) {}

  public start(state: CampaignCommandUIStateSnapshot): void {
    this.state = state;
    if (!this.listening && typeof window !== "undefined") {
      window.addEventListener("resize", this.onResize);
      this.listening = true;
    }
    this.apply();
  }

  public sync(state: CampaignCommandUIStateSnapshot): void {
    this.state = state;
    this.apply();
  }

  public destroy(): void {
    if (this.listening && typeof window !== "undefined") window.removeEventListener("resize", this.onResize);
    this.listening = false;
    this.state = null;
  }

  private apply(): void {
    if (!this.state || typeof window === "undefined") return;
    const workspace = this.root.querySelector<HTMLElement>("#campaignWorkspacePanel");
    const inspector = this.root.querySelector<HTMLElement>("#campaignContextInspector");
    this.setUnavailable(workspace, window.innerWidth <= 860 && !this.state.workspaceExpanded);
    this.setUnavailable(inspector, window.innerWidth <= 1120 && !this.state.inspectorExpanded);
  }

  private setUnavailable(element: HTMLElement | null, unavailable: boolean): void {
    if (!element) return;
    element.inert = unavailable;
    if (unavailable) element.setAttribute("aria-hidden", "true");
    else element.removeAttribute("aria-hidden");
  }
}

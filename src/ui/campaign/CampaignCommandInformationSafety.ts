/** Test and development assertions for keeping hidden campaign truth out of rendered command UI. */

export interface CampaignCommandDOMLeak {
  readonly secret: string;
  readonly location: string;
}

/** Scans visible text and DOM attributes for exact truth sentinels supplied by a test fixture. */
export function findCampaignCommandDOMLeaks(
  root: HTMLElement,
  forbiddenValues: readonly string[]
): readonly CampaignCommandDOMLeak[] {
  const secrets = forbiddenValues.filter((value) => value.length > 0);
  const leaks: CampaignCommandDOMLeak[] = [];
  const visit = (element: Element): void => {
    element.getAttributeNames().forEach((attribute) => {
      const value = element.getAttribute(attribute) ?? "";
      secrets.forEach((secret) => {
        if (value.includes(secret)) leaks.push({ secret, location: `${element.tagName.toLowerCase()}[${attribute}]` });
      });
    });
    element.childNodes.forEach((node) => {
      if (node.nodeType !== 3) return;
      const value = node.textContent ?? "";
      secrets.forEach((secret) => {
        if (value.includes(secret)) leaks.push({ secret, location: `${element.tagName.toLowerCase()} text` });
      });
    });
    Array.from(element.children).forEach(visit);
  };
  visit(root);
  return Object.freeze(leaks.map((leak) => Object.freeze({ ...leak })));
}

export function assertCampaignCommandDOMSafe(root: HTMLElement, forbiddenValues: readonly string[]): void {
  const leaks = findCampaignCommandDOMLeaks(root, forbiddenValues);
  if (leaks.length === 0) return;
  throw new Error(`Campaign command DOM exposed forbidden projection data: ${leaks.map((leak) => leak.location).join(", ")}`);
}

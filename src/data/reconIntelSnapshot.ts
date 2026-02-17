export type ReconIntelConfidence = "low" | "medium" | "high";
export type ReconIntelTimeframe = "last" | "current" | "forecast";

export interface ReconIntelSectorReport {
  id: string;
  name: string;
  summary: string;
  timeframe: ReconIntelTimeframe;
  confidence: ReconIntelConfidence;
  linkedBriefs: string[];
  coordinates: string;
  activity: string;
}

export interface ReconIntelBrief {
  id: string;
  title: string;
  assessment: string;
  timeframe: ReconIntelTimeframe;
  confidence: ReconIntelConfidence;
  linkedSectors: string[];
  projectedImpact: string;
}

export type ReconIntelAlertSeverity = "info" | "warning" | "critical";

export interface ReconIntelAlert {
  id: string;
  severity: ReconIntelAlertSeverity;
  message: string;
  timeframe: ReconIntelTimeframe;
  action: string;
}

export interface ReconIntelSnapshot {
  generatedAt: string;
  sectors: ReconIntelSectorReport[];
  intelBriefs: ReconIntelBrief[];
  alerts: ReconIntelAlert[];
}

const reconIntelSnapshot: ReconIntelSnapshot = {
  generatedAt: new Date().toISOString(),
  sectors: [
    {
      id: "sector-speartip",
      name: "Spear Tip Ridge",
      summary: "Forward observers report heavy armor staging east of Ridge Road.",
      timeframe: "current",
      confidence: "high",
      linkedBriefs: ["brief-counterarmor"],
      coordinates: "E4-E6",
      activity: "Tracked vehicles idling, logistics drones replenishing ammo reserves."
    },
    {
      id: "sector-riverwatch",
      name: "Riverwatch Crossing",
      summary: "Night patrol logged convoys delivering bridging kits to south shore depots.",
      timeframe: "last",
      confidence: "medium",
      linkedBriefs: ["brief-riverlogistics"],
      coordinates: "B11",
      activity: "Supply barges rotating every four hours with escort gunboats."
    },
    {
      id: "sector-ghostline",
      name: "Ghost Line",
      summary: "Intercepted chatter hints at masked artillery relocation behind fog banks.",
      timeframe: "forecast",
      confidence: "low",
      linkedBriefs: ["brief-phantom"],
      coordinates: "H2",
      activity: "Thermals inconsistent; likely decoys masking limited rocket trucks."
    }
  ],
  intelBriefs: [
    {
      id: "brief-counterarmor",
      title: "Counter-armor pressure expected at dawn",
      assessment: "Analysts project a coordinated armor thrust aiming to split frontline battalions within two turns.",
      timeframe: "current",
      confidence: "high",
      linkedSectors: ["sector-speartip"],
      projectedImpact: "Recommend pre-sighting artillery batteries and committing tank destroyers to the ridge."
    },
    {
      id: "brief-riverlogistics",
      title: "Bridging assets reinforce southern approach",
      assessment: "Bridge layers arriving overnight indicate preparation for a mechanized crossing within 48 hours.",
      timeframe: "last",
      confidence: "medium",
      linkedSectors: ["sector-riverwatch"],
      projectedImpact: "Divert engineers to lay charges and coordinate interdiction strikes before columns deploy."
    },
    {
      id: "brief-phantom",
      title: "Conflicting reports on artillery redeployment",
      assessment: "Signals bureau notes spoofed emissions; analysts unsure if artillery massing or staging diversion.",
      timeframe: "forecast",
      confidence: "low",
      linkedSectors: ["sector-ghostline"],
      projectedImpact: "Hold rapid-response reconnaissance flights in reserve until additional confirmation arrives."
    }
  ],
  alerts: [
    {
      id: "alert-armor-push",
      severity: "critical",
      message: "Armor assault likely within next engagement cycle. Requisition countermeasure assets now.",
      timeframe: "current",
      action: "Queue dedicated anti-armor deployment from reserves."
    },
    {
      id: "alert-bridge-build",
      severity: "warning",
      message: "Bridging teams staging along river corridor; expect crossing attempts once weather clears.",
      timeframe: "last",
      action: "Task artillery observers to monitor crossing points and prepare interdiction fire."
    },
    {
      id: "alert-misdirection",
      severity: "info",
      message: "Artillery relocation unverified; enemy may be masking strength through signal spoofing.",
      timeframe: "forecast",
      action: "Escalate electronic warfare sweeps before redeploying batteries."
    }
  ]
};

export function getReconIntelSnapshot(): ReconIntelSnapshot {
  return {
    ...reconIntelSnapshot,
    sectors: reconIntelSnapshot.sectors.map((sector) => ({
      ...sector,
      linkedBriefs: [...sector.linkedBriefs]
    })),
    intelBriefs: reconIntelSnapshot.intelBriefs.map((brief) => ({
      ...brief,
      linkedSectors: [...brief.linkedSectors]
    })),
    alerts: reconIntelSnapshot.alerts.map((alert) => ({
      ...alert
    }))
  };
}

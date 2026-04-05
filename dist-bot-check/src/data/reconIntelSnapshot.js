"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getReconIntelSnapshot = getReconIntelSnapshot;
var reconIntelSnapshot = {
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
    ],
    counterIntel: {
        deceptionCharges: 0,
        deceptionMaxCharges: 2,
        verificationCharges: 0,
        verificationMaxCharges: 2,
        suspectedFalseBriefs: 1,
        confirmedFalseBriefs: 0,
        verifiedBriefs: 0,
        doctrineSummary: "Low-confidence briefs may be enemy deception. Spend verification to confirm reports, or project deception to pull enemy battalions toward a false axis.",
        activeOperations: []
    }
};
function getReconIntelSnapshot() {
    return __assign(__assign({}, reconIntelSnapshot), { sectors: reconIntelSnapshot.sectors.map(function (sector) { return (__assign(__assign({}, sector), { linkedBriefs: __spreadArray([], sector.linkedBriefs, true) })); }), intelBriefs: reconIntelSnapshot.intelBriefs.map(function (brief) { return (__assign(__assign({}, brief), { linkedSectors: __spreadArray([], brief.linkedSectors, true) })); }), alerts: reconIntelSnapshot.alerts.map(function (alert) { return (__assign({}, alert)); }), counterIntel: reconIntelSnapshot.counterIntel
            ? __assign(__assign({}, reconIntelSnapshot.counterIntel), { activeOperations: reconIntelSnapshot.counterIntel.activeOperations.map(function (operation) { return (__assign({}, operation)); }) }) : undefined });
}

# War Room HQ Improvements Plan

## Issues to Fix

### 1. Technical Jargon Breaking Immersion
- **Current**: "Phase: playerTurn", "Active faction: Player"
- **Fix**: Use narrative language like "Our forces advancing", "Enemy preparing counterattack"

### 2. Campaign Timeline Doesn't Fit Standalone Missions
- **Current**: Shows "Day 4" based on turn number, always present
- **Fix**: Only show for campaign mode, hide for standalone missions

### 3. Command Orders Wrong Concept
- **Current**: 4-star general receiving orders from higher HQ
- **Fix**: Rename to "Field Reports" - show recent activity from units
  - Movement reports: "2nd Infantry reported digging in at hex 14,5"
  - Combat reports: "Tank battalion engaged enemy armor, 2 kills confirmed"
  - Supply reports: "Supply convoy reached forward positions"
  - Casualty reports: "3rd Company sustained 15% casualties in sector 7"

### 4. Placeholder/Generic Data
**Recon Reports**:
- **Current**: Just lists player unit positions
- **Fix**: Show enemy contacts, terrain observations, spotted units

**Engagement Log**:
- **Current**: Generic "operations continue" message
- **Fix**: Pull from actual combat events - attacks, air strikes, retreats

### 5. Data Sources to Use

#### Available Real Data:
- `engine.getRosterSnapshot()` - Casualties, unit counts
- `engine.getAirMissionReports()` - Air operations
- Bot turn summary - Enemy movements/attacks
- Combat reports (if tracked)
- Supply snapshots

#### Proposed Data Mapping:

**Intel Briefs** (keep current + enhance):
- Mission briefing (good)
- Turn overview → Make narrative: "Turn 4: Our forces holding positions while enemy probes defenses"

**Recon Reports** → **Contact Reports**:
- Show enemy units spotted by recon/aircraft
- Terrain observations from recon units
- "Recon team Alpha spotted enemy tank formation in hex 8,12"

**Supply Status** (keep current approach):
- Current implementation is good

**Requisitions** → **Unit Readiness**:
- Instead of "pending requisitions", show which units need resupply
- "2nd Infantry: Ammo 40%, Fuel 60% - Priority: Medium"

**Casualty Ledger** (enhance):
- Currently only shows KIA count
- Add: casualties by unit type, recent losses trend

**Engagement Log** → **Combat Summary**:
- Pull from actual battles that occurred
- Show attacker, defender, result, casualties
- "Turn 3: Our Panzer IV destroyed enemy AT gun at hex 10,5"

**Logistics Summary** (keep current):
- Works well

**Command Orders** → **Field Reports**:
- Recent unit activities from the turn
- Movement: "A Company relocated to defensive position hex 12,3"
- Combat: "Tank platoon engaged, 2 enemy destroyed, 1 friendly damaged"
- Supply: "Resupply convoy completed delivery to forward units"
- Engineering: "Engineers fortified position at hex 8,9"

**Readiness State** (enhance):
- Current % is good
- Add breakdown: "Frontline: 12 units, Support: 4 units, Reserves: 6 units"

**Campaign Clock** (conditional):
- Only show if in campaign mode
- For standalone missions, show "Mission Time: Turn X of Y"

## Implementation Steps

### Step 1: Fix Immersion-Breaking Language
File: `BattleWarRoomDataProvider.ts`

```typescript
// Line 57: Turn overview
private formatTurnNarrative(turn: TurnSummary): string {
  const isPlayerPhase = turn.phase === "playerTurn" || turn.phase === "deployment";
  const isEnemyPhase = turn.phase === "botTurn";

  if (isPlayerPhase) {
    return `Our forces assessing positions and coordinating next moves.`;
  } else if (isEnemyPhase) {
    return `Enemy forces maneuvering. Reconnaissance reports incoming.`;
  } else {
    return `Operations transition in progress.`;
  }
}
```

### Step 2: Make Campaign Timeline Conditional
```typescript
// Only show campaign clock if in campaign mode
snapshot.campaignClock = this.isInCampaignMode()
  ? {
      day: this.getCampaignDay(),
      time: this.getCampaignTime(),
      note: "Campaign Day X",
      phase: this.getCampaignPhase()
    }
  : {
      day: turn.turnNumber,
      time: "",
      note: `Mission Turn ${turn.turnNumber}${mission?.turnLimit ? ` of ${mission.turnLimit}` : ""}`,
      phase: undefined
    };
```

### Step 3: Convert Command Orders to Field Reports
```typescript
// Pull from recent turn activity
private composeFieldReports(engine: GameEngine): CommandDirective[] {
  const reports: CommandDirective[] = [];
  const turnSummary = engine.getTurnSummary();

  // Get air mission reports
  const airReports = engine.getAirMissionReports();
  const recentAir = airReports.slice(-3); // Last 3 missions

  for (const airMission of recentAir) {
    if (airMission.event === "resolved") {
      reports.push({
        title: `Air Operations - ${airMission.unitType}`,
        objective: airMission.outcome?.details ?? "Mission completed",
        priority: airMission.outcome?.result === "success" ? "medium" : "high"
      });
    }
  }

  // Get casualty reports from roster
  const roster = engine.getRosterSnapshot();
  const recentCasualties = roster.casualties.slice(-2);

  for (const casualty of recentCasualties) {
    reports.push({
      title: `Casualty Report - ${casualty.type}`,
      objective: `Unit destroyed in sector. Replacement requested.`,
      priority: "high"
    });
  }

  // If no recent activity, show status reports
  if (reports.length === 0) {
    reports.push({
      title: "Status Update",
      objective: `All units reporting positions secure. No contact with enemy forces.`,
      priority: "low"
    });
  }

  return reports.slice(0, 5); // Max 5 reports
}
```

### Step 4: Enhance Engagement Log with Real Combat Data
```typescript
// Use bot turn summary and air mission results
private composeEngagementLog(engine: GameEngine): EngagementSummary[] {
  const engagements: EngagementSummary[] = [];
  const airReports = engine.getAirMissionReports();

  // Add air strike results
  for (const air of airReports.slice(-3)) {
    if (air.kind === "strike" && air.outcome) {
      engagements.push({
        theater: air.targetHex ? `Sector ${this.formatDisplayHex(air.targetHex)}` : "Unknown sector",
        result: air.outcome.result === "success" ? "victory" : "defeat",
        note: air.outcome.details,
        timestamp: new Date().toISOString()
      });
    }
  }

  // TODO: Add ground combat results when combat reports are available

  return engagements;
}
```

### Step 5: Improve Recon Reports
```typescript
// Show enemy contacts and spotted units (from game visibility system)
private composeReconReports(engine: GameEngine): ReconReport[] {
  const reports: ReconReport[] = [];

  // Get player's recon units
  const playerUnits = engine.playerUnits;
  const reconUnits = playerUnits.filter(u => {
    const def = engine.getUnitDefinition(u.type);
    return def.class === "recon" || def.class === "air";
  });

  // For each recon unit, report what they might see
  for (const recon of reconUnits.slice(0, 3)) {
    const sector = this.formatDisplayHex(recon.hex);
    reports.push({
      sector: `Sector ${sector}`,
      finding: `${recon.type} conducting reconnaissance sweep. Area under observation.`,
      confidence: recon.strength > 75 ? "High" : "Medium",
      reportedBy: recon.type,
      timestamp: new Date().toISOString()
    });
  }

  // TODO: Add actual enemy contact reports when visibility system is integrated

  return reports;
}
```

## Summary of Changes

### Files to Modify:
1. `src/ui/components/BattleWarRoomDataProvider.ts` - Main data generation
2. `src/data/warRoomHotspots.ts` - Rename "Command Orders" to "Field Reports"
3. `src/data/warRoomTypes.ts` - Update CommandDirective type name/description

### New Features:
- Narrative language instead of technical terms
- Campaign timeline only shows in campaign mode
- Field Reports based on actual unit activity
- Engagement log pulls from real combat/air mission results
- Better recon reports

### Testing:
- Test in standalone mission mode (no campaign timeline)
- Test in campaign mode (timeline appears)
- Verify field reports show recent air missions
- Verify engagement log shows air strike results
- Ensure no "playerTurn" or technical jargon appears

## Future Enhancements (Phase 2):
- Track ground combat events for engagement log
- Add unit movement tracking for field reports
- Show enemy unit intel from reconnaissance
- Add map markers for recent engagements
- Casualty breakdown by unit type and sector

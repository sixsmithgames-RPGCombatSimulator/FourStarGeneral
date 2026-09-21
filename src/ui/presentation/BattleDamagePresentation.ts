interface PersonnelDamageProjection {
  readonly injured: number;
  readonly wounded: number;
  readonly severelyWounded: number;
  readonly killed: number;
}

interface EquipmentDamageProjection {
  readonly damaged: number;
  readonly disabled: number;
  readonly destroyed: number;
}

interface StatusTransitionProjection {
  readonly count: number;
  readonly from: string;
  readonly to: string;
}

interface ReadinessComponentProjection {
  readonly readiness: number;
}

interface ReadinessBreakdownProjection {
  readonly personnel: ReadinessComponentProjection;
  readonly equipment: ReadinessComponentProjection | null;
}

/** Narrow UI contract for damage copy; engine-owned objects remain read-only inputs. */
export interface BattleDamageProjection {
  readonly strengthBefore: number;
  readonly strengthAfter: number;
  readonly personnel: PersonnelDamageProjection;
  readonly equipment: EquipmentDamageProjection;
  readonly componentDamage?: {
    readonly damaged: Readonly<Record<string, number>>;
    readonly disabled: Readonly<Record<string, number>>;
    readonly destroyed: Readonly<Record<string, number>>;
  };
  readonly damageTypesUsed: readonly string[];
  readonly statusTransitions?: {
    readonly personnel: readonly StatusTransitionProjection[];
    readonly equipment: readonly StatusTransitionProjection[];
  };
  readonly statusBefore: { readonly readinessBreakdown: ReadinessBreakdownProjection };
  readonly statusAfter: { readonly readinessBreakdown: ReadinessBreakdownProjection };
  readonly weaponHits: readonly {
    readonly label: string;
    readonly shots: number;
    readonly expectedHits: number;
    readonly personnel: PersonnelDamageProjection;
    readonly equipment: EquipmentDamageProjection;
  }[];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function formatReadinessValue(value: number): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  if (Number.isInteger(safeValue)) return safeValue.toFixed(0);
  const roundedTenths = Math.round(safeValue * 10) / 10;
  return Math.abs(safeValue - roundedTenths) < 0.001 ? safeValue.toFixed(1) : safeValue.toFixed(2);
}

export function formatDamageAmount(value: number): string {
  return formatReadinessValue(Math.min(100, Math.max(0, value)));
}

export function formatPersonnelDelta(damage: BattleDamageProjection | null | undefined): string {
  if (!damage) return "No personnel projection";
  const parts: string[] = [];
  if (damage.personnel.killed > 0) parts.push(`${damage.personnel.killed} KIA`);
  if (damage.personnel.severelyWounded > 0) parts.push(`${damage.personnel.severelyWounded} severe`);
  if (damage.personnel.wounded > 0) parts.push(`${damage.personnel.wounded} wounded`);
  if (damage.personnel.injured > 0) parts.push(`${damage.personnel.injured} injured`);
  return parts.length > 0 ? parts.join(", ") : "No personnel losses";
}

export function formatEquipmentDelta(damage: BattleDamageProjection | null | undefined): string {
  if (!damage) return "No equipment projection";
  const parts: string[] = [];
  if (damage.equipment.destroyed > 0) parts.push(`${damage.equipment.destroyed} destroyed`);
  if (damage.equipment.disabled > 0) parts.push(`${damage.equipment.disabled} disabled`);
  if (damage.equipment.damaged > 0) parts.push(`${damage.equipment.damaged} damaged`);
  return parts.length > 0 ? parts.join(", ") : "No equipment losses";
}

export function formatComponentDelta(damage: BattleDamageProjection | null | undefined): string {
  if (!damage?.componentDamage) return "No component damage";
  const parts: string[] = [];
  const append = (label: string, values: Readonly<Record<string, number>>): void => {
    Object.entries(values)
      .filter(([, count]) => count > 0)
      .forEach(([component, count]) => parts.push(`${count} ${component} ${label}`));
  };
  append("damaged", damage.componentDamage.damaged);
  append("disabled", damage.componentDamage.disabled);
  append("destroyed", damage.componentDamage.destroyed);
  return parts.length > 0 ? parts.join(", ") : "No component damage";
}

export function formatDamageTypes(damage: BattleDamageProjection | null | undefined): string {
  if (!damage || damage.damageTypesUsed.length === 0) return "Not classified";
  return damage.damageTypesUsed
    .map((type) => type.replace(/[-_]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase()))
    .join(", ");
}

export function formatStatusTransitions(damage: BattleDamageProjection | null | undefined): string {
  const transitions = damage?.statusTransitions;
  if (!transitions) return "No status shifts";
  const parts = [...transitions.personnel, ...transitions.equipment]
    .filter((entry) => entry.count > 0)
    .map((entry) => `${entry.count} ${entry.from}->${entry.to}`);
  return parts.length > 0 ? parts.join(", ") : "No status shifts";
}

export function renderReadinessProjectionRows(damage: BattleDamageProjection | null | undefined): string {
  if (!damage) return "";
  const before = damage.statusBefore.readinessBreakdown;
  const after = damage.statusAfter.readinessBreakdown;
  const equipmentRow = before.equipment && after.equipment
    ? `
        <div class="damage-projection-row">
          <span>Equipment readiness</span>
          <strong>${formatReadinessValue(before.equipment.readiness)}% -> ${formatReadinessValue(after.equipment.readiness)}%</strong>
        </div>
      `
    : "";
  return `
      <div class="damage-projection">
        <div class="damage-projection-row damage-projection-row--primary">
          <span>Combat readiness</span>
          <strong>${formatReadinessValue(damage.strengthBefore)}% -> ${formatReadinessValue(damage.strengthAfter)}%</strong>
        </div>
        <div class="damage-projection-row">
          <span>Personnel readiness</span>
          <strong>${formatReadinessValue(before.personnel.readiness)}% -> ${formatReadinessValue(after.personnel.readiness)}%</strong>
        </div>
        ${equipmentRow}
        <div class="damage-projection-row">
          <span>Personnel effects</span>
          <strong>${escapeHtml(formatPersonnelDelta(damage))}</strong>
        </div>
        <div class="damage-projection-row">
          <span>Equipment effects</span>
          <strong>${escapeHtml(formatEquipmentDelta(damage))}</strong>
        </div>
        <div class="damage-projection-row">
          <span>Status shifts</span>
          <strong>${escapeHtml(formatStatusTransitions(damage))}</strong>
        </div>
      </div>
    `;
}

export function renderWeaponStatusEffects(damage: BattleDamageProjection | null | undefined): string {
  if (!damage || damage.weaponHits.length === 0) {
    return `<p><strong>Status Effects by Weapon:</strong> No weapon-level status effects projected.</p>`;
  }
  const rows = damage.weaponHits.map((hit) => {
    const personnel = formatPersonnelDelta({
      ...damage,
      personnel: hit.personnel,
      equipment: { damaged: 0, disabled: 0, destroyed: 0 }
    });
    const equipment = formatEquipmentDelta({
      ...damage,
      personnel: { injured: 0, wounded: 0, severelyWounded: 0, killed: 0 },
      equipment: hit.equipment
    });
    return `
        <div class="weapon-group-item">
          <span class="weapon-name">${escapeHtml(hit.label)}:</span>
          <span class="weapon-stats">${hit.shots} shots, ${hit.expectedHits.toFixed(1)} hits</span>
          <span class="weapon-overmatch">${escapeHtml(personnel)}; ${escapeHtml(equipment)}</span>
        </div>
      `;
  }).join("");
  return `
      <div class="weapon-groups-detail">
        <strong>Status Effects by Weapon:</strong>
        ${rows}
      </div>
    `;
}

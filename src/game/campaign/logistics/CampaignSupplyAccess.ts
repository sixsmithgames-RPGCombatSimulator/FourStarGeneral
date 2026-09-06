/** Pure shared supply connectivity used by operational control and formation recovery. */
import type { CampaignFactionKey } from "../../../core/campaignTypes";
import { neighbors } from "../../../core/Hex";
import type { CampaignRuntimeState, CampaignScenarioDefinition } from "../runtime/campaignRuntimeTypes";

const SUPPLY_SOURCE_ROLES = new Set(["logisticsHub", "airbase", "navalBase"]);

/** Rebuilds the existing friendly-control supply graph without retaining or changing runtime state. */
export function getCampaignFriendlySupplyNetwork(
  runtime: CampaignRuntimeState,
  definition: CampaignScenarioDefinition,
  faction: CampaignFactionKey
): { readonly sources: readonly string[]; readonly reachable: ReadonlySet<string> } {
  const sources = runtime.tileOrder.filter((hexKey) => {
    const tile = runtime.tiles[hexKey];
    const palette = tile ? definition.map.tilePalette[tile.tileKey] : null;
    return tile?.controller === faction
      && Boolean(palette && ((palette.supplyValue ?? 0) > 0 || SUPPLY_SOURCE_ROLES.has(palette.role)));
  });
  const reachable = new Set(sources);
  const queue = [...sources];
  while (queue.length > 0) {
    const current = runtime.tiles[queue.shift()!];
    neighbors(current.hex).forEach((hex) => {
      const key = `${hex.q},${hex.r}`;
      if (reachable.has(key) || runtime.tiles[key]?.controller !== faction) return;
      reachable.add(key);
      queue.push(key);
    });
  }
  return { sources, reachable };
}

/** Queries one canonical runtime axial key; missing or nonfriendly tiles have no friendly supply access. */
export function hasCampaignFriendlySupplyAccess(
  runtime: CampaignRuntimeState,
  definition: CampaignScenarioDefinition,
  faction: CampaignFactionKey,
  runtimeHexKey: string
): boolean {
  return runtime.tiles[runtimeHexKey]?.controller === faction
    && getCampaignFriendlySupplyNetwork(runtime, definition, faction).reachable.has(runtimeHexKey);
}

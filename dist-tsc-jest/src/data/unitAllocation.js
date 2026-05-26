import { formationList, getFormation, isUnitAllocationKey, unitFormations } from "./unitSystem/formations";
export const allocationOptions = Object.freeze(formationList.map((formation) => ({
    key: formation.key,
    label: formation.label,
    category: formation.requisition.category,
    costPerUnit: formation.requisition.costPerUnit,
    description: formation.gameplayDescription,
    maxQuantity: formation.requisition.maxQuantity,
    spriteUrl: formation.spriteUrl,
    implemented: formation.requisition.implemented,
    visibleInAllocationUi: formation.requisition.visibleInAllocationUi,
    depotPayload: formation.requisition.depotPayload
})));
export const ALLOCATION_BY_KEY = Object.freeze(Object.fromEntries(allocationOptions.map((option) => [option.key, option])));
export const ALLOCATION_BY_CATEGORY = (() => {
    const categoryMap = new Map();
    for (const option of allocationOptions) {
        const bucket = categoryMap.get(option.category);
        if (bucket) {
            bucket.push(option);
        }
        else {
            categoryMap.set(option.category, [option]);
        }
    }
    return new Map(Array.from(categoryMap.entries(), ([category, options]) => [
        category,
        Object.freeze(options)
    ]));
})();
export { isUnitAllocationKey as isAllocationKey };
export function getAllocationOption(key) {
    if (!isUnitAllocationKey(key)) {
        return undefined;
    }
    return ALLOCATION_BY_KEY[key];
}
export function getAllocationFormation(key) {
    return getFormation(key);
}
export { unitFormations };

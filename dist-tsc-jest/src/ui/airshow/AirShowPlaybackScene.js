export function resolveResolvedAirShowBombers(scene) {
    if (Array.isArray(scene.bombers) && scene.bombers.length > 0) {
        return scene.bombers;
    }
    return scene.bomber ? [scene.bomber] : [];
}
export function resolvePrimaryResolvedAirShowBomber(scene) {
    return resolveResolvedAirShowBombers(scene)[0] ?? null;
}

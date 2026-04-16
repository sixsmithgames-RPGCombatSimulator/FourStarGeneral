import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { resolveFortificationCoverBonusPct } from "../src/core/Combat";
registerTest("DIRECTIONAL_FORTIFICATIONS_APPLY_FULL_HALF_OR_ZERO_COVER", async ({ Then }) => {
    const defenderHex = { q: 0, r: 0 };
    const fullCover = resolveFortificationCoverBonusPct({ q: 2, r: 0 }, defenderHex, "E", "infantry");
    const stackedCover = resolveFortificationCoverBonusPct({ q: 2, r: 0 }, defenderHex, ["SE", "E"], "infantry");
    const splitCover = resolveFortificationCoverBonusPct({ q: 1, r: 1 }, defenderHex, "SE", "infantry");
    const noCover = resolveFortificationCoverBonusPct({ q: 2, r: 0 }, defenderHex, "W", "infantry");
    const topAttackCover = resolveFortificationCoverBonusPct({ q: 2, r: 0 }, defenderHex, "E", "artillery");
    await Then("the fortification bonus only applies through the protected edge and halves on split-angle fire", async () => {
        if (fullCover !== -20) {
            throw new Error(`Expected full directional fortification cover to grant -20 accuracy, received ${fullCover}.`);
        }
        if (stackedCover !== -20) {
            throw new Error(`Expected stacked fortification faces to grant full cover when one protected edge matches, received ${stackedCover}.`);
        }
        if (splitCover !== -10) {
            throw new Error(`Expected split-angle fortification cover to grant half protection (-10), received ${splitCover}.`);
        }
        if (noCover !== 0) {
            throw new Error(`Expected attacks through an unprotected face to receive no fortification cover, received ${noCover}.`);
        }
        if (topAttackCover !== 0) {
            throw new Error(`Expected top-attack classes to ignore edge fortifications, received ${topAttackCover}.`);
        }
    });
});

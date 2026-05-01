import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { getSpriteForAllocationKey, getSpriteForScenarioType } from "../src/data/unitSpriteCatalog";
registerTest("UNITSPRITECATALOG_RESOLVES_FACTION_AND_DIRECTIONAL_VARIANTS", async ({ When, Then }) => {
    const resolved = {};
    await When("sprites are requested for faction-aware and directional units", async () => {
        resolved.playerBomber = getSpriteForScenarioType("Bomber", "Player");
        resolved.botBomber = getSpriteForScenarioType("Bomber", "Bot");
        resolved.playerGroundAttack = getSpriteForScenarioType("Ground_Attack", "Player");
        resolved.botInterceptor = getSpriteForScenarioType("Interceptor", "Bot");
        resolved.playerEscort = getSpriteForScenarioType("Fighter", "Player");
        resolved.playerAllocationEscort = getSpriteForAllocationKey("fighter", "Player");
        resolved.playerTankSouth = getSpriteForScenarioType("Light_Tank", "Player", "SE");
        resolved.playerTankNorth = getSpriteForScenarioType("Light_Tank", "Player", "NE");
        resolved.playerTankWest = getSpriteForScenarioType("Light_Tank", "Player", "W");
        resolved.playerTankAllocation = getSpriteForAllocationKey("tank", "Player");
        resolved.botReconNorth = getSpriteForScenarioType("Recon_Bike", "Bot", "NE");
        resolved.botReconWest = getSpriteForScenarioType("Recon_Bike", "Bot", "W");
        resolved.playerReconSouth = getSpriteForScenarioType("Recon_Bike", "Player", "SE");
    });
    await Then("the catalog should resolve faction-specific aircraft and directional ground sprites", async () => {
        if (!resolved.playerBomber?.includes("Aircraft_USA_B17.png")) {
            throw new Error(`Expected player bomber sprite to use B17 art, saw ${String(resolved.playerBomber)}.`);
        }
        if (!resolved.botBomber?.includes("Aircraft_German_HE177.png")) {
            throw new Error(`Expected enemy bomber sprite to use HE177 art, saw ${String(resolved.botBomber)}.`);
        }
        if (!resolved.playerGroundAttack?.includes("Aircraft_USA_B25.png")) {
            throw new Error(`Expected player strike aircraft sprite to use B25 art, saw ${String(resolved.playerGroundAttack)}.`);
        }
        if (!resolved.botInterceptor?.includes("Aircraft_German_FW190.png")) {
            throw new Error(`Expected enemy interceptor sprite to use FW190 art, saw ${String(resolved.botInterceptor)}.`);
        }
        if (!resolved.playerEscort?.includes("Aircraft_USA_P51.png")) {
            throw new Error(`Expected player escort sprite to use P51 art, saw ${String(resolved.playerEscort)}.`);
        }
        if (!resolved.playerAllocationEscort?.includes("Aircraft_USA_P51.png")) {
            throw new Error(`Expected player fighter allocation card to use P51 art, saw ${String(resolved.playerAllocationEscort)}.`);
        }
        if (!resolved.playerTankSouth?.includes("Tank_M4_USA_Southview")) {
            throw new Error(`Expected player tank south view to use M4 Southview, saw ${String(resolved.playerTankSouth)}.`);
        }
        if (!resolved.playerTankNorth?.includes("Tank_M4_USA_Northview")) {
            throw new Error(`Expected player tank north view to use M4 Northview, saw ${String(resolved.playerTankNorth)}.`);
        }
        if (!resolved.playerTankWest?.includes("Tank_M4_USA_Sideview")) {
            throw new Error(`Expected player tank west view to use M4 Sideview, saw ${String(resolved.playerTankWest)}.`);
        }
        if (!resolved.playerTankAllocation?.includes("Tank_M4_USA_Southview")) {
            throw new Error(`Expected tank allocation card to resolve USA M4 art, saw ${String(resolved.playerTankAllocation)}.`);
        }
        if (resolved.playerTankAllocation?.includes("Panzer")) {
            throw new Error(`Expected tank allocation card to avoid German Panzer art, saw ${String(resolved.playerTankAllocation)}.`);
        }
        if (!resolved.botReconNorth?.includes("Wheeled_Bikes_Recon_German_Northview")) {
            throw new Error(`Expected bot recon north view to use German Northview art, saw ${String(resolved.botReconNorth)}.`);
        }
        if (!resolved.botReconWest?.includes("Wheeled_Bikes_Recon_German_Sideview")) {
            throw new Error(`Expected bot recon west view to use German Sideview art, saw ${String(resolved.botReconWest)}.`);
        }
        if (!resolved.playerReconSouth?.includes("Wheeled_Bikes_Recon_USA_Southview")) {
            throw new Error(`Expected player recon south view to use USA Southview art, saw ${String(resolved.playerReconSouth)}.`);
        }
    });
});

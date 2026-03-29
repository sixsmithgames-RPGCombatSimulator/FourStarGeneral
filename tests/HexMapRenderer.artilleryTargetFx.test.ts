import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { HexMapRenderer } from "../src/rendering/HexMapRenderer";

registerTest("HEXMAP_ARTILLERY_ATTACKS_SKIP_OPENING_IMPACT_FLASH", async ({ Given, When, Then }) => {
  const renderer = new HexMapRenderer() as unknown as {
    playAttackSequence(attackerHexKey: string, defenderHexKey: string, targetIsHardTarget: boolean): Promise<void>;
    hexElementMap: Map<string, unknown>;
    extractHexCenter: (element: unknown) => { cx: number; cy: number } | null;
    setHexFacingAngle: (hexKey: string, cx: number, cy: number, angle: number) => void;
    getUnitClassAt: (hexKey: string) => string | undefined;
    getUnitScenarioTypeAt: (hexKey: string) => string | undefined;
    isSmallArmsAttack: (hexKey: string) => boolean;
    isArcingArtilleryAttack: (hexKey: string) => boolean;
    isAirStrafingAttack: (hexKey: string) => boolean;
    isAirBombingAttack: (hexKey: string) => boolean;
    playFlashOverlay: () => Promise<void>;
    playMuzzleFlash: () => Promise<void>;
    playTargetMarker: () => Promise<void>;
    playRecoilNudge: () => Promise<void>;
    playHitShake: () => Promise<void>;
    playSparkBurst: () => Promise<void>;
    playDustCloudLinger: () => Promise<void>;
    playProjectileTracer: () => Promise<void>;
    playArcedProjectile: () => Promise<void>;
  } & {
    playCombatAnimation: (animationType: string, hexKey: string, offsetX?: number, offsetY?: number, scale?: number) => Promise<void>;
  };

  let flashCalls = 0;
  const combatCalls: Array<{ animationType: string; hexKey: string }> = [];
  const originalSetTimeout = window.setTimeout;

  await Given("an arcing-artillery attack sequence", async () => {
    window.setTimeout = ((handler: TimerHandler, _timeout?: number, ...args: unknown[]) => {
      if (typeof handler === "function") {
        handler(...args);
      }
      return 0 as unknown as number;
    }) as typeof window.setTimeout;

    renderer.hexElementMap.set("0,0", {});
    renderer.hexElementMap.set("1,0", {});
    renderer.extractHexCenter = () => ({ cx: 100, cy: 100 });
    renderer.setHexFacingAngle = () => {};
    renderer.getUnitClassAt = (hexKey) => (hexKey === "0,0" ? "artillery" : "tank");
    renderer.getUnitScenarioTypeAt = (hexKey) => (hexKey === "0,0" ? "Howitzer_105" : "Medium_Tank");
    renderer.isSmallArmsAttack = () => false;
    renderer.isArcingArtilleryAttack = () => true;
    renderer.isAirStrafingAttack = () => false;
    renderer.isAirBombingAttack = () => false;
    renderer.playFlashOverlay = async () => {
      flashCalls += 1;
    };
    renderer.playMuzzleFlash = async () => {};
    renderer.playTargetMarker = async () => {};
    renderer.playRecoilNudge = async () => {};
    renderer.playHitShake = async () => {};
    renderer.playSparkBurst = async () => {};
    renderer.playDustCloudLinger = async () => {};
    renderer.playProjectileTracer = async () => {};
    renderer.playArcedProjectile = async () => {};
    renderer.playCombatAnimation = async (animationType, hexKey) => {
      combatCalls.push({ animationType, hexKey });
    };
  });

  await When("the artillery impact sequence plays", async () => {
    await renderer.playAttackSequence("0,0", "1,0", false);
  });

  window.setTimeout = originalSetTimeout;

  await Then("the small barrage still plays but the opening impact flash is skipped entirely", async () => {
    if (flashCalls !== 0) {
      throw new Error(`Expected no opening impact flash for artillery attacks, received ${flashCalls} flash call(s).`);
    }

    const smallBursts = combatCalls.filter((call) => call.animationType === "explosionSmall");
    if (smallBursts.length !== 4) {
      throw new Error(`Expected four small artillery bursts, received ${smallBursts.length}.`);
    }
  });
});

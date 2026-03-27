import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { HexMapRenderer } from "../src/rendering/HexMapRenderer";

registerTest("HEXMAP_SMALL_ARMS_MUZZLE_FLASH_USES_SMALL_STAGGERED_BURSTS", async ({ Given, When, Then }) => {
  const renderer = new HexMapRenderer() as unknown as {
    playMuzzleFlash(attackerHexKey: string, soundBursts?: number, soundIntervalMs?: number, gainMultiplier?: number): Promise<void>;
    getUnitScenarioTypeAt: (hexKey: string) => string | undefined;
    playCombatAnimation: (animationType: string, hexKey: string, offsetX?: number, offsetY?: number, scale?: number, soundRequest?: unknown) => Promise<void>;
    playWeaponSoundBurst: (attackerHexKey: string, burstCount: number, intervalMs: number, gainMultiplier: number) => Promise<void>;
  };

  const flashCalls: Array<{ animationType: string; hexKey: string; offsetX: number; offsetY: number; scale: number }> = [];
  const soundCalls: Array<{ attackerHexKey: string; burstCount: number; intervalMs: number; gainMultiplier: number }> = [];
  const originalSetTimeout = window.setTimeout;

  await Given("a small-arms attacker with animation and sound playback stubbed", async () => {
    window.setTimeout = ((handler: TimerHandler, _timeout?: number, ...args: unknown[]) => {
      if (typeof handler === "function") {
        handler(...args);
      }
      return 0 as unknown as number;
    }) as typeof window.setTimeout;
    renderer.getUnitScenarioTypeAt = () => "Infantry_42";
    renderer.playCombatAnimation = async (animationType, hexKey, offsetX = 0, offsetY = 0, scale = 1) => {
      flashCalls.push({ animationType, hexKey, offsetX, offsetY, scale });
    };
    renderer.playWeaponSoundBurst = async (attackerHexKey, burstCount, intervalMs, gainMultiplier) => {
      soundCalls.push({ attackerHexKey, burstCount, intervalMs, gainMultiplier });
    };
  });

  await When("the muzzle flash helper runs", async () => {
    await renderer.playMuzzleFlash("0,0", 3, 72, 0.84);
  });

  window.setTimeout = originalSetTimeout;

  await Then("it emits several tiny spread-out muzzle bursts and preserves the configured sound burst timing", async () => {
    if (flashCalls.length !== 5) {
      throw new Error(`Expected five staggered small-arms muzzle flashes, found ${flashCalls.length}.`);
    }
    if (!flashCalls.every((call) => call.animationType === "small_arms_muzzle")) {
      throw new Error(`Expected only small_arms_muzzle visuals, received ${flashCalls.map((call) => call.animationType).join(", ")}`);
    }
    if (!flashCalls.every((call) => call.hexKey === "0,0")) {
      throw new Error("Expected every muzzle flash burst to stay anchored to the attacker hex.");
    }
    if (Math.max(...flashCalls.map((call) => call.scale)) > 0.24) {
      throw new Error(`Expected small-arms muzzle flashes to stay tiny, received scales ${flashCalls.map((call) => call.scale).join(", ")}`);
    }

    const uniqueOffsets = new Set(flashCalls.map((call) => `${call.offsetX},${call.offsetY}`));
    if (uniqueOffsets.size !== flashCalls.length) {
      throw new Error(`Expected each muzzle flash burst to use a distinct offset, found ${uniqueOffsets.size} unique offsets.`);
    }

    const maxOffset = Math.max(...flashCalls.map((call) => Math.max(Math.abs(call.offsetX), Math.abs(call.offsetY))));
    if (maxOffset > 4) {
      throw new Error(`Expected muzzle flash offsets to stay tight to the attacker, received max offset ${maxOffset}.`);
    }

    if (soundCalls.length !== 1) {
      throw new Error(`Expected one delegated sound burst request, found ${soundCalls.length}.`);
    }
    const [soundCall] = soundCalls;
    if (!soundCall || soundCall.burstCount !== 3 || soundCall.intervalMs !== 72 || soundCall.gainMultiplier !== 0.84) {
      throw new Error(`Expected sound burst request (3, 72, 0.84), received ${JSON.stringify(soundCall)}`);
    }
  });
});

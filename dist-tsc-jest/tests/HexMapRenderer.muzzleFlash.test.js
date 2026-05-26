import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { HexMapRenderer } from "../src/rendering/HexMapRenderer";
registerTest("HEXMAP_SMALL_ARMS_MUZZLE_FLASH_USES_SMALL_STAGGERED_BURSTS", async ({ Given, When, Then }) => {
    const renderer = new HexMapRenderer();
    const flashCalls = [];
    const soundCalls = [];
    const originalSetTimeout = window.setTimeout;
    await Given("a small-arms attacker with animation and sound playback stubbed", async () => {
        window.setTimeout = ((handler, _timeout, ...args) => {
            if (typeof handler === "function") {
                handler(...args);
            }
            return 0;
        });
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
    await Then("it emits mixed tiny muzzle bursts and preserves the configured sound burst timing", async () => {
        if (flashCalls.length < 8) {
            throw new Error(`Expected mixed infantry muzzle flashes, found only ${flashCalls.length}.`);
        }
        const flashTypes = new Set(flashCalls.map((call) => call.animationType));
        if (!flashTypes.has("small_arms_muzzle") || !flashTypes.has("mg_muzzle") || !flashTypes.has("cannon_muzzle")) {
            throw new Error(`Expected small-arms, MG, and support-weapon muzzle flashes, received ${[...flashTypes].join(", ")}`);
        }
        if (!flashCalls.every((call) => call.hexKey === "0,0")) {
            throw new Error("Expected every muzzle flash burst to stay anchored to the attacker hex.");
        }
        if (Math.max(...flashCalls.map((call) => call.scale)) > 0.24) {
            throw new Error(`Expected infantry muzzle flashes to stay tiny, received scales ${flashCalls.map((call) => call.scale).join(", ")}`);
        }
        const uniqueOffsets = new Set(flashCalls.map((call) => `${call.offsetX},${call.offsetY}`));
        if (uniqueOffsets.size < 6) {
            throw new Error(`Expected mixed muzzle flashes to use several offsets, found ${uniqueOffsets.size} unique offsets.`);
        }
        const maxOffset = Math.max(...flashCalls.map((call) => Math.max(Math.abs(call.offsetX), Math.abs(call.offsetY))));
        if (maxOffset > 5) {
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

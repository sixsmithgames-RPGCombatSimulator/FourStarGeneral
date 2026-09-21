import "./domEnvironment.js";
import { CombatSoundManager } from "../src/audio/CombatSoundManager.js";
import { registerTest } from "./harness.js";

registerTest("COMBAT_SOUND_MANAGER_DEGRADES_SAFELY_WITHOUT_WEB_AUDIO", async ({ Given, When, Then }) => {
  const audioWindow = window as Window & typeof globalThis & {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const originalAudioContext = audioWindow.AudioContext;
  const originalWebkitAudioContext = audioWindow.webkitAudioContext;
  let manager: CombatSoundManager | null = null;

  await Given("a browser runtime without either Web Audio constructor", async () => {
    Object.defineProperty(audioWindow, "AudioContext", { configurable: true, writable: true, value: undefined });
    Object.defineProperty(audioWindow, "webkitAudioContext", { configurable: true, writable: true, value: undefined });
  });

  try {
    await When("the tactical renderer constructs its canonical combat-sound boundary", async () => {
      manager = new CombatSoundManager();
      manager.setMasterVolume(0.35);
    });

    await Then("tactical initialization remains available while capability stays distinct from volume preference", async () => {
      if (!manager || manager.getMasterVolume() !== 0.35) {
        throw new Error("Combat audio fallback did not preserve its public volume contract.");
      }
      const availability = manager.getAvailability();
      if (availability.available || !availability.reason?.includes("unavailable")) {
        throw new Error(`Combat audio fallback did not publish its unavailable capability: ${JSON.stringify(availability)}.`);
      }
    });
  } finally {
    Object.defineProperty(audioWindow, "AudioContext", {
      configurable: true,
      writable: true,
      value: originalAudioContext
    });
    Object.defineProperty(audioWindow, "webkitAudioContext", {
      configurable: true,
      writable: true,
      value: originalWebkitAudioContext
    });
  }
});

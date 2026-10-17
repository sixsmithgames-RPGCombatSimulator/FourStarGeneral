import "./domEnvironment.js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { CombatSoundManager } from "../src/audio/CombatSoundManager.js";
import type { SoundAssetMeta, SoundCatalog } from "../src/audio/SoundAssetMetadata.js";
import { WEAPON_AUDIO_PROFILES, type WeaponAudioProfile } from "../src/audio/WeaponAudioProfiles.js";
import { registerTest } from "./harness.js";

interface AudioSourceProbe {
  buffer: AudioBuffer | null;
  playbackRate: { value: number };
  onended: (() => void) | null;
  starts: number[];
  disconnected: boolean;
  connect(): void;
  disconnect(): void;
  start(time: number): void;
}

interface AudioFixture {
  state: AudioContextState;
  currentTime: number;
  destination: object;
  sources: AudioSourceProbe[];
  gains: Array<{ gain: { value: number }; disconnected: boolean; connect(): void; disconnect(): void }>;
  buffers: Map<string, AudioBuffer>;
  resumeCalls: number;
  resume: () => Promise<void>;
  createBufferSource(): AudioSourceProbe;
  createGain(): AudioFixture["gains"][number];
  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer>;
}

const assets: SoundAssetMeta[] = [
  { id: "small_arms_fire_01", family: "transient", weaponClass: "small_arms", variantIndex: 0,
    durationMs: 180, loudnessClass: "light", tags: [], filePath: "sounds/combat/small_arms_fire_01.mp3" },
  { id: "small_arms_fire_02", family: "transient", weaponClass: "small_arms", variantIndex: 1,
    durationMs: 185, loudnessClass: "light", tags: [], filePath: "sounds/combat/small_arms_fire_02.mp3" },
  { id: "impact_armor_01", family: "impact", weaponClass: "cannon", variantIndex: 0,
    durationMs: 190, loudnessClass: "medium", tags: [], filePath: "sounds/combat/impact_armor_01.mp3" },
  { id: "impact_armor_02", family: "impact", weaponClass: "cannon", variantIndex: 1,
    durationMs: 195, loudnessClass: "medium", tags: [], filePath: "sounds/combat/impact_armor_02.mp3" }
];
const catalog: SoundCatalog = { version: "audio-boundary-test", assets: Object.fromEntries(assets.map((asset) => [asset.id, asset])) };
const shot = { weaponClass: "small_arms", playbackMode: "transient_only", seed: 17 } as const;

/** Read the authored source, rather than a potentially stale compiled catalog copy. */
function readShippedCatalog(directory = "src"): SoundCatalog {
  return JSON.parse(readFileSync(resolve(process.cwd(), directory, "data/soundCatalog.json"), "utf8")) as SoundCatalog;
}

/** Recording identity must follow bytes, not filenames that can hide duplicate variants. */
function recordingHash(asset: SoundAssetMeta): string {
  return createHash("sha256").update(readFileSync(resolve(process.cwd(), "public", asset.filePath))).digest("hex");
}

/** Enumerate each independently selectable pool without conflating reused cross-weapon recordings. */
function profilePools(profile: WeaponAudioProfile): Array<{ name: string; ids: readonly string[] }> {
  return [
    { name: "transient", ids: profile.transientPool },
    { name: "body", ids: profile.bodyPool ?? [] },
    { name: "mechanical", ids: profile.mechanicalPool ?? [] },
    { name: "flight", ids: profile.flightPool ?? [] },
    { name: "tail", ids: profile.tailPools ?? [] },
    ...Object.entries(profile.impactPoolsByMaterial).map(([material, ids]) => ({ name: `impact:${material}`, ids })),
    ...Object.entries(profile.debrisPoolsByMaterial ?? {}).map(([material, ids]) => ({ name: `debris:${material}`, ids }))
  ];
}

/** Install the minimum Web Audio boundary and always restore global browser services. */
async function withAudioFixture(
  test: (fixture: AudioFixture, manager: CombatSoundManager) => Promise<void>,
  fixtureAssets: readonly SoundAssetMeta[] = assets
): Promise<void> {
  const originalContext = Object.getOwnPropertyDescriptor(window, "AudioContext");
  const originalFetch = globalThis.fetch;
  const fixture: AudioFixture = {
    state: "running", currentTime: 10, destination: {}, sources: [], gains: [], buffers: new Map(), resumeCalls: 0,
    async resume() { fixture.resumeCalls += 1; fixture.state = "running"; },
    createBufferSource() {
      const source: AudioSourceProbe = {
        buffer: null, playbackRate: { value: 1 }, onended: null, starts: [], disconnected: false,
        connect() {}, disconnect() { source.disconnected = true; }, start(time) { source.starts.push(time); }
      };
      fixture.sources.push(source);
      return source;
    },
    createGain() {
      const gain = { gain: { value: 1 }, disconnected: false,
        connect() {}, disconnect() { gain.disconnected = true; } };
      fixture.gains.push(gain);
      return gain;
    },
    async decodeAudioData(data) {
      const id = new TextDecoder().decode(data);
      // The manager treats buffers as opaque Web Audio handles; no sample API is called.
      const buffer = { duration: 0.25 } as AudioBuffer;
      fixture.buffers.set(id, buffer);
      return buffer;
    }
  };
  Object.defineProperty(window, "AudioContext", { configurable: true, value: function () { return fixture; } });
  globalThis.fetch = async (input) => {
    const path = String(input);
    const asset = fixtureAssets.find((entry) => path.endsWith(entry.filePath));
    assert.ok(asset, `Unexpected audio fetch: ${path}`);
    return new Response(new TextEncoder().encode(asset.id), { status: 200 });
  };
  try {
    await test(fixture, new CombatSoundManager());
  } finally {
    globalThis.fetch = originalFetch;
    if (originalContext) Object.defineProperty(window, "AudioContext", originalContext);
    else Reflect.deleteProperty(window, "AudioContext");
  }
}

registerTest("COMBAT_SOUND_MUTED_CUES_NEVER_RESUME_OR_CREATE_SOURCES", async () => {
  await withAudioFixture(async (fixture, manager) => {
    await manager.loadSoundCatalog(catalog);
    fixture.state = "suspended";
    manager.setMasterVolume(0);
    await manager.playWeaponSound(shot);
    assert.equal(fixture.resumeCalls, 0, "A muted cue must not unlock or resume audio.");
    assert.equal(fixture.sources.length, 0, "A muted cue must not remain playing silently until sound is enabled.");
    assert.equal(manager.getAvailability().available, true, "Mute must remain separate from audio capability.");
  });
});

registerTest("COMBAT_SOUND_CATALOG_PUBLIC_AND_BUNDLED_METADATA_AGREE", () => {
  const shipped = readShippedCatalog();
  assert.deepEqual(readShippedCatalog("public"), shipped, "Public decoding and bundled gameplay must share identical audio metadata.");
  for (const [id, asset] of Object.entries(shipped.assets)) {
    assert.equal(asset.id, id, "Catalog keys must agree with the IDs used by the buffer cache.");
    assert.ok(Number.isInteger(asset.durationMs) && asset.durationMs > 0, `${id}: full-clip duration must be positive whole milliseconds.`);
    assert.ok(recordingHash(asset), `${id}: the authored recording must be present.`);
  }
});

registerTest("COMBAT_SOUND_PROFILE_REFERENCES_RESOLVE_TO_SHIPPED_ASSETS", () => {
  const shipped = readShippedCatalog();
  for (const profile of Object.values(WEAPON_AUDIO_PROFILES)) {
    for (const pool of profilePools(profile)) {
      for (const id of pool.ids) {
        assert.ok(shipped.assets[id], `${profile.weaponClass}/${pool.name}: missing asset ${id}.`);
      }
    }
  }
});

registerTest("COMBAT_SOUND_SELECTABLE_POOL_RECORDINGS_ARE_DISTINCT", () => {
  const shipped = readShippedCatalog();
  for (const profile of Object.values(WEAPON_AUDIO_PROFILES)) {
    for (const pool of profilePools(profile)) {
      const seen = new Map<string, string>();
      for (const id of pool.ids) {
        const asset = shipped.assets[id];
        assert.ok(asset, `${profile.weaponClass}/${pool.name}: missing asset ${id}.`);
        const hash = recordingHash(asset);
        assert.ok(!seen.has(hash), `${profile.weaponClass}/${pool.name}: ${id} duplicates ${seen.get(hash)} and defeats variation cooldown.`);
        seen.set(hash, id);
      }
    }
  }
});

registerTest("COMBAT_SOUND_MG_COOLDOWN_PREVENTS_REPEATED_RECORDINGS", async () => {
  const shipped = readShippedCatalog();
  await withAudioFixture(async (fixture, manager) => {
    await manager.loadSoundCatalog(shipped);
    let previousHash: string | undefined;
    for (let cue = 1; cue <= 24; cue += 1) {
      // Spread first draws over the pool; adjacent tiny LCG seeds sample only
      // its first indices and would miss the duplicated third recording.
      await manager.playWeaponSound({ weaponClass: "mg", playbackMode: "transient_only", seed: cue * 1009 });
      assert.equal(fixture.sources.length, cue, "Each fresh muzzle cue must create exactly one source.");
      const source = fixture.sources[cue - 1]!;
      const asset = Object.values(shipped.assets).find((entry) => fixture.buffers.get(entry.id) === source.buffer);
      assert.ok(asset, "Public playback must select a decoded authored recording.");
      const hash = recordingHash(asset);
      assert.notEqual(hash, previousHash, `Cue ${cue} repeats the previous MG recording under a different variant ID.`);
      previousHash = hash;
      source.onended?.();
    }
  }, Object.values(shipped.assets));
});

registerTest("COMBAT_SOUND_DURATION_METADATA_NEVER_SCHEDULES_OR_WAITS_FOR_PLAYBACK", async () => {
  await withAudioFixture(async (fixture, manager) => {
    const observations: Array<{ starts: number[]; pitch: number; gain: number }> = [];
    for (const durationMs of [1, 3_600_000]) {
      const durationCatalog: SoundCatalog = {
        ...catalog,
        assets: Object.fromEntries(assets.map((asset) => [asset.id, { ...asset, durationMs }]))
      };
      await manager.loadSoundCatalog(durationCatalog);
      manager.clearRepetitionHistory();
      const playback = manager.playWeaponSound(shot);
      assert.equal(await Promise.race([playback.then(() => "started"), wait(100).then(() => "blocked")]), "started",
        "Clip metadata must never become a visual-cue delay or an awaited sound-completion clock.");
      const source = fixture.sources[fixture.sources.length - 1]!;
      observations.push({ starts: source.starts, pitch: source.playbackRate.value, gain: fixture.gains[fixture.gains.length - 1]!.gain.value });
      assert.equal(source.disconnected, false, "Playback readiness must settle before the real source-ended event.");
      source.onended?.();
    }
    assert.deepEqual(observations[1], observations[0], "Changing descriptive clip length must not change start time, pitch or gain.");
  });
});

registerTest("COMBAT_SOUND_BLOCKED_RESUME_EXPIRES_WITHOUT_REPLAYING_STALE_CUES", async () => {
  await withAudioFixture(async (fixture, manager) => {
    await manager.loadSoundCatalog(catalog);
    fixture.state = "suspended";
    let releaseResume: (() => void) | undefined;
    fixture.resume = () => new Promise<void>((resolve) => {
      fixture.resumeCalls += 1;
      releaseResume = () => { fixture.state = "running"; resolve(); };
    });
    const playback = manager.playWeaponSound(shot);
    const result = await Promise.race([playback.then(() => "settled"), wait(750).then(() => "blocked")]);
    assert.equal(result, "settled", "Autoplay-blocked audio must never strand the awaited combat presentation.");
    assert.equal(fixture.sources.length, 0);
    releaseResume?.();
    await wait(0);
    assert.equal(fixture.sources.length, 0, "Unlocking after expiry must not replay an old visual cue.");
    await manager.playWeaponSound({ ...shot, seed: 18 });
    assert.equal(fixture.sources.length, 1, "A fresh cue must succeed after the browser permits audio.");
  });
});

registerTest("COMBAT_SOUND_MUTE_DURING_RESUME_CANCELS_PENDING_CUE", async () => {
  await withAudioFixture(async (fixture, manager) => {
    await manager.loadSoundCatalog(catalog);
    fixture.state = "suspended";
    let releaseResume: (() => void) | undefined;
    fixture.resume = () => new Promise<void>((resolve) => {
      releaseResume = () => { fixture.state = "running"; resolve(); };
    });
    const playback = manager.playWeaponSound(shot);
    await wait(0);
    assert.ok(releaseResume, "The cue must already be waiting on browser resume before mute.");
    manager.setMasterVolume(0);
    releaseResume?.();
    await playback;
    assert.equal(fixture.sources.length, 0, "Muting during async readiness must cancel the cue before source creation.");
    manager.setMasterVolume(0.7);
    assert.equal(fixture.sources.length, 0, "Re-enabling audio must not reveal an older muted event.");
  });
});

registerTest("COMBAT_SOUND_REJECTED_RESUME_NEVER_QUEUES_A_SOURCE", async () => {
  await withAudioFixture(async (fixture, manager) => {
    await manager.loadSoundCatalog(catalog);
    fixture.state = "suspended";
    fixture.resume = async () => { throw new Error("browser gesture required"); };
    await manager.playWeaponSound(shot);
    assert.equal(fixture.sources.length, 0, "Rejected unlock must not leave queued sources that later play out of sync.");
    fixture.state = "closed";
    await manager.playWeaponSound(shot);
    assert.equal(fixture.sources.length, 0, "Closed audio must not allocate sources or block presentation.");
  });
});

registerTest("COMBAT_SOUND_PENDING_PRELOAD_SKIPS_CUE_WITHOUT_LATE_BACKLOG", async () => {
  await withAudioFixture(async (fixture, manager) => {
    const decode = fixture.decodeAudioData;
    let completeDecode: (() => void) | undefined;
    const decodeGate = new Promise<void>((resolve) => { completeDecode = resolve; });
    fixture.decodeAudioData = async (data) => { await decodeGate; return decode(data); };
    const preload = manager.loadSoundCatalog(catalog);
    const playback = manager.playWeaponSound(shot);
    assert.equal(await Promise.race([playback.then(() => "settled"), wait(100).then(() => "blocked")]), "settled",
      "A pending audio preload must not hold the combat visual sequence.");
    completeDecode?.();
    await Promise.all([preload, playback]);
    assert.equal(fixture.sources.length, 0, "Completing preload must not replay the earlier visual cue.");
    await manager.playWeaponSound(shot);
    assert.equal(fixture.sources.length, 1, "Fresh visual cues must use the completed preload.");
  });
});

registerTest("COMBAT_SOUND_START_FAILURE_RELEASES_NODES_AND_REJECTS", async () => {
  await withAudioFixture(async (fixture, manager) => {
    await manager.loadSoundCatalog(catalog);
    const createSource = fixture.createBufferSource;
    fixture.createBufferSource = () => {
      const source = createSource();
      source.start = () => { throw new Error("audio device unavailable"); };
      return source;
    };
    await assert.rejects(manager.playWeaponSound(shot), /audio device unavailable/);
    assert.equal(fixture.sources[0]!.disconnected, true);
    assert.equal(fixture.gains[1]!.disconnected, true);
  });
});

registerTest("COMBAT_SOUND_FAILED_ASSET_LOAD_IS_OBSERVABLE_AND_RECOVERABLE", async () => {
  await withAudioFixture(async (fixture, manager) => {
    const validFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(null, { status: 404, statusText: "Not Found" });
    await assert.rejects(manager.loadSoundCatalog(catalog), /sounds\/combat\/.*404/,
      "Missing audio must reject catalog readiness instead of reporting success.");
    assert.equal(manager.getAvailability().available, false);
    assert.match(manager.getAvailability().reason ?? "", /reload/i, "Unavailable audio needs actionable recovery text.");
    await manager.playWeaponSound(shot);
    assert.equal(fixture.sources.length, 0, "A reported preload failure must settle optional playback without partial audio.");
    globalThis.fetch = validFetch;
    await manager.loadSoundCatalog(catalog);
    assert.equal(manager.getAvailability().available, true);
    await manager.playWeaponSound(shot);
    assert.equal(fixture.sources.length, 1);
  });
});

registerTest("COMBAT_SOUND_FAILED_DECODE_IS_OBSERVABLE", async () => {
  await withAudioFixture(async (fixture, manager) => {
    fixture.decodeAudioData = async () => { throw new Error("unsupported audio encoding"); };
    await assert.rejects(manager.loadSoundCatalog(catalog), /small_arms_fire_01.*unsupported audio encoding/);
    assert.equal(manager.getAvailability().available, false);
    await manager.playWeaponSound(shot);
    assert.equal(fixture.sources.length, 0);
  });
});

registerTest("COMBAT_SOUND_WEAPON_AND_IMPACT_CUES_STAY_SEPARATE_AND_RELEASE_NODES", async () => {
  await withAudioFixture(async (fixture, manager) => {
    await manager.loadSoundCatalog(catalog);
    await manager.playWeaponSound({ ...shot, playbackMode: "weapon", targetMaterial: "armor" });
    assert.equal(fixture.sources.length, 1, "Muzzle cues must not play a premature impact.");
    const muzzle = fixture.sources[0]!;
    assert.ok(["small_arms_fire_01", "small_arms_fire_02"].some((id) => fixture.buffers.get(id) === muzzle.buffer));
    await manager.playWeaponSound({ ...shot, playbackMode: "impact_only", targetMaterial: "armor" });
    assert.equal(fixture.sources.length, 2, "An impact must add exactly one impact source, without repeating the muzzle.");
    const impact = fixture.sources[1]!;
    assert.ok(["impact_armor_01", "impact_armor_02"].some((id) => fixture.buffers.get(id) === impact.buffer));
    assert.ok(fixture.sources.every((source) => source.starts.length === 1 && source.starts[0]! >= fixture.currentTime));
    fixture.sources.forEach((source) => source.onended?.());
    assert.ok(fixture.sources.every((source) => source.disconnected), "Ended sources must disconnect.");
    assert.ok(fixture.gains.slice(1).every((gain) => gain.disconnected), "Per-event gains must disconnect after playback.");
    assert.equal(fixture.gains[0]!.disconnected, false, "The one shared master gain must survive individual cues.");
  });
});

registerTest("COMBAT_SOUND_VOLUME_REJECTS_NON_FINITE_INPUT_WITHOUT_POISONING_MIX", async () => {
  await withAudioFixture(async (fixture, manager) => {
    manager.setMasterVolume(0.35);
    for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      assert.throws(() => manager.setMasterVolume(invalid), /finite/i);
      assert.equal(manager.getMasterVolume(), 0.35);
      assert.equal(fixture.gains[0]!.gain.value, 0.35);
    }
    manager.setMasterVolume(2);
    assert.equal(manager.getMasterVolume(), 1);
    manager.setMasterVolume(-1);
    assert.equal(manager.getMasterVolume(), 0);
  });
});

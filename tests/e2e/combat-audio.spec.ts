import { expect, test } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import type { SoundCatalog } from "../../src/audio/SoundAssetMetadata";

const soundCatalog = JSON.parse(readFileSync(new URL("../../src/data/soundCatalog.json", import.meta.url), "utf8")) as SoundCatalog;

/** Decode the shipped files with each browser's real codec, independently of autoplay/device output. */
test("all combat sound assets decode to finite audible samples", async ({ page }, testInfo) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const publicCatalog = await page.request.get("/data/soundCatalog.json");
  expect(publicCatalog.ok(), "The published sound catalog must be available").toBe(true);
  expect(await publicCatalog.json(), "Bundled and public catalogs must not disagree").toEqual(soundCatalog);
  const capabilities = await page.evaluate(() => ({
    offline: typeof OfflineAudioContext !== "undefined",
    realtime: typeof AudioContext !== "undefined"
  }));
  test.skip(!capabilities.offline && !capabilities.realtime,
    "This browser runtime has no Web Audio codec API (Windows Playwright WebKit); decode is not certified here.");

  const measurements = await page.evaluate(async (catalog) => {
    const context = typeof OfflineAudioContext !== "undefined"
      ? new OfflineAudioContext(2, 1, 44100)
      : new AudioContext();
    const results = [];
    try {
      for (const asset of Object.values(catalog.assets)) {
        const response = await fetch(new URL(asset.filePath, document.baseURI));
        if (!response.ok) throw new Error(`${asset.id}: HTTP ${response.status}`);
        const encoded = await response.arrayBuffer();
        let decoded: AudioBuffer;
        try {
          decoded = await context.decodeAudioData(encoded);
        } catch (error) {
          throw new Error(`${asset.id}: browser audio decode failed: ${String(error)}`);
        }
        let peak = 0;
        let sumSquares = 0;
        let nonFiniteSamples = 0;
        let fullScaleSamples = 0;
        for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
          for (const sample of decoded.getChannelData(channel)) {
            if (!Number.isFinite(sample)) nonFiniteSamples += 1;
            peak = Math.max(peak, Math.abs(sample));
            sumSquares += sample * sample;
            if (Math.abs(sample) >= 1) fullScaleSamples += 1;
          }
        }
        const sampleCount = decoded.length * decoded.numberOfChannels;
        results.push({
          id: asset.id,
          durationMs: decoded.duration * 1000,
          catalogDurationMs: asset.durationMs,
          channels: decoded.numberOfChannels,
          sampleCount,
          nonFiniteSamples,
          peak,
          rms: Math.sqrt(sumSquares / sampleCount),
          fullScaleFraction: fullScaleSamples / sampleCount
        });
      }
      return results;
    } finally {
      if (typeof AudioContext !== "undefined" && context instanceof AudioContext) await context.close();
    }
  }, soundCatalog);

  const evidencePath = testInfo.outputPath("decoded-combat-audio.json");
  writeFileSync(evidencePath, JSON.stringify(measurements, null, 2));
  await testInfo.attach("decoded-combat-audio.json", {
    path: evidencePath,
    contentType: "application/json"
  });
  expect(measurements).toHaveLength(Object.keys(soundCatalog.assets).length);
  for (const asset of measurements) {
    expect(asset.sampleCount, asset.id).toBeGreaterThan(0);
    expect(asset.durationMs, asset.id).toBeGreaterThan(0);
    // Browsers differ by one decoded MP3 sample; whole-millisecond catalog
    // metadata describes the complete recording, never the visual cue duration.
    expect(Math.abs(asset.durationMs - asset.catalogDurationMs), `${asset.id}: catalog must describe the decoded full clip`).toBeLessThanOrEqual(1);
    expect(asset.nonFiniteSamples, asset.id).toBe(0);
    expect(asset.peak, `${asset.id} must not be silent`).toBeGreaterThan(0.01);
    expect(asset.rms, `${asset.id} must contain audible energy`).toBeGreaterThan(0.0001);
  }
});

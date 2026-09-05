/**
 * FSG-CAM-001: inspect the shipped public HTML and owned artwork, not a fixture.
 * These static contracts prove identity, route intent, and semantic structure.
 * They do not prove app routing, CSS geometry, contrast, or browser focus behavior;
 * those require runtime and visual verification. Run from the repository root.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { registerTest } from "./harness.js";

const landingPath = "public/landing/index.html";
const pictographs = /[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u20E3]/u;

/** Parse the actual artifact without scripts, network requests, or shared DOM state. */
function readLanding(): JSDOM {
  return new JSDOM(readFileSync(landingPath, "utf8"), { url: "https://landing.invalid/" });
}

registerTest("FSG_CAM_080_LANDING_CAMPAIGN_IDENTITY", async ({ Given, When, Then }) => {
  const page = readLanding();
  try {
    const document = page.window.document;
    await Given("the public landing artifact served at the site root", () => {});
    await When("its metadata and opening campaign briefing are read", () => {});
    await Then("the game, Operation Overlord, persistent campaign, and WWII command role lead", () => {
      assert.match(document.title, /Four Star General.*Operation Overlord.*Campaign/i);
      for (const selector of ['meta[name="description"]', 'meta[property="og:description"]']) {
        const description = document.querySelector(selector)?.getAttribute("content") ?? "";
        assert.match(description, /Operation Overlord/, `${selector} must identify the campaign`);
        assert.match(description, /persistent/i, `${selector} must explain campaign continuity`);
        assert.match(description, /World War II|WWII/, `${selector} must identify the command setting`);
      }
      assert.equal(document.querySelector('meta[property="og:title"]')?.getAttribute("content"), document.title);
      const heading = document.querySelector("main h1");
      assert.match(heading?.textContent ?? "", /Operation Overlord/);
      const opening = heading?.closest("section")?.textContent ?? "";
      assert.match(opening, /command.*Allied|Allied.*command/is);
      assert.match(opening, /persistent.*campaign/is);
      assert.match(opening, /World War II|WWII/);
    });
  } finally {
    page.window.close();
  }
});

registerTest("FSG_CAM_081_LANDING_CAMPAIGN_ROUTE_INTENT", async ({ Given, When, Then }) => {
  const page = readLanding();
  try {
    await Given("a visitor reading the opening campaign section", () => {});
    await When("the static launch destinations and their document order are inspected", () => {});
    await Then("Enter Campaign is primary and tactical battle selection is secondary", () => {
      const launches = Array.from(page.window.document.querySelectorAll<HTMLAnchorElement>('main a[href^="/play"]'));
      assert.ok(launches.length > 0, "Provide a native launch link in the main content");
      const [campaign, tactical] = launches;
      assert.equal(campaign.textContent?.trim(), "Enter Campaign");
      assert.equal(launches.length, 2, "Offer campaign entry and standalone tactical selection");
      assert.equal(campaign.closest("section"), page.window.document.querySelector("main h1")?.closest("section"), "Campaign entry must accompany the opening briefing");
      assert.equal(campaign.getAttribute("href"), "/play?mode=campaign", "Preserve campaign intent for the app entry handler");
      assert.ok(campaign.classList.contains("btn-primary"), "Campaign must retain primary emphasis");
      assert.match(tactical.textContent ?? "", /Tactical Battles/);
      assert.equal(tactical.getAttribute("href"), "/play");
      assert.ok(!tactical.classList.contains("btn-primary"), "Standalone battles must remain secondary");
      for (const launch of launches) {
        assert.ok(!launch.hasAttribute("onclick"), "Launch must remain a native navigable link");
        assert.notEqual(launch.getAttribute("tabindex"), "-1");
        assert.notEqual(launch.getAttribute("aria-disabled"), "true");
      }
    });
  } finally {
    page.window.close();
  }
});

registerTest("FSG_CAM_082_LANDING_SEMANTICS_AND_HELP", async ({ Given, When, Then }) => {
  const page = readLanding();
  try {
    const document = page.window.document;
    await Given("the same static document without JavaScript", () => {});
    await When("landmarks, headings, zoom configuration, and help destinations are inspected", () => {});
    await Then("readers have ordered headings, a skip link, scalable content, and help", () => {
      assert.equal(document.documentElement.lang, "en");
      assert.equal(document.querySelectorAll("main").length, 1);
      assert.equal(document.querySelectorAll("h1").length, 1);
      const main = document.querySelector("main");
      assert.ok(main?.id, "The main landmark needs a skip-link destination");
      assert.ok(document.querySelector(`a[href="#${main.id}"]`), "Provide keyboard access past navigation");
      let previousLevel = 0;
      for (const heading of document.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
        const level = Number(heading.tagName.slice(1));
        assert.ok(heading.textContent?.trim(), "Headings must have readable text");
        assert.ok(level <= previousLevel + 1, `Heading order skips from h${previousLevel} to h${level}`);
        previousLevel = level;
      }
      const viewport = document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? "";
      assert.match(viewport, /width=device-width/);
      assert.doesNotMatch(viewport, /user-scalable\s*=\s*no|maximum-scale\s*=/i);
      for (const container of ["header nav", "footer"]) {
        const help = document.querySelector(`${container} a[href="https://sixsmithgames.com/help"]`);
        assert.match(help?.textContent ?? "", /help/i, `${container} must offer a named help link`);
      }
      for (const link of document.querySelectorAll("a")) {
        assert.ok(link.textContent?.trim() || link.getAttribute("aria-label"), "Links need accessible text");
      }
    });
  } finally {
    page.window.close();
  }
});

registerTest("FSG_CAM_083_LANDING_OWNED_ART_WITHOUT_OS_PICTOGRAPHS", async ({ Given, When, Then }) => {
  const page = readLanding();
  try {
    const document = page.window.document;
    await Given("the public page and the artwork it actually references", () => {});
    await When("decoded text, CSS content, and local SVG sources are inspected", () => {});
    await Then("authored source-controlled vectors replace native OS pictographs", () => {
      assert.doesNotMatch(document.documentElement.textContent ?? "", pictographs, "Remove native OS pictographs from copy and CSS");
      assert.doesNotMatch(document.documentElement.outerHTML, pictographs, "Remove native OS pictographs from attributes");
      const art = Array.from(document.querySelectorAll<HTMLImageElement>('img[src^="/landing/assets/"]'));
      assert.ok(art.length > 0, "The page must use owned landing artwork");
      for (const image of art) {
        assert.ok(image.hasAttribute("alt"), "Every image needs meaningful or deliberately empty alternative text");
        const source = image.getAttribute("src") ?? "";
        assert.match(source, /^\/landing\/assets\/[a-z0-9-]+\.svg$/, "Keep artwork local and source-reviewable");
        const svgSource = readFileSync(resolve("public", source.slice(1)), "utf8");
        const svg = new JSDOM(svgSource, { contentType: "image/svg+xml" });
        try {
          assert.equal(svg.window.document.documentElement.localName, "svg");
          assert.ok(svg.window.document.documentElement.hasAttribute("viewBox"));
          assert.ok(svg.window.document.querySelector("path, polygon, rect"), "Artwork must contain authored geometry");
          assert.equal(svg.window.document.querySelector("script, foreignObject, image"), null, "Art must be self-contained vector geometry");
          assert.doesNotMatch(svg.window.document.documentElement.textContent ?? "", pictographs);
        } finally {
          svg.window.close();
        }
      }
      for (const icon of document.querySelectorAll("svg")) {
        assert.equal(icon.getAttribute("aria-hidden"), "true", "Decorative inline marks should not duplicate link text");
        assert.equal(icon.getAttribute("focusable"), "false", "Decorative marks must not add keyboard stops");
      }
    });
  } finally {
    page.window.close();
  }
});

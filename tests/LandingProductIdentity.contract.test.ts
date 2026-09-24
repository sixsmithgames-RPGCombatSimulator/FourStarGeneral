/**
 * Public-root identity contract.
 *
 * Four Star General is the product. Tactical battles and the persistent campaign
 * are modes within that product; no individual operation may replace the game
 * itself as the public-page identity.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { registerTest } from "./harness.js";

const landingPath = "public/landing/index.html";

function readLanding(): JSDOM {
  return new JSDOM(readFileSync(landingPath, "utf8"), { url: "https://landing.invalid/" });
}

registerTest("FSG_LANDING_PRODUCT_IDENTITY", async ({ Given, When, Then }) => {
  const page = readLanding();
  try {
    const document = page.window.document;
    await Given("the public page served at the site root", () => {});
    await When("the metadata and opening hero are read", () => {});
    await Then("Four Star General leads without presenting one campaign as the whole product", () => {
      assert.match(document.title, /^Four Star General\b/i);
      assert.doesNotMatch(document.title, /Operation Overlord/i);

      const description = document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";
      assert.match(description, /Four Star General/i);
      assert.match(description, /World War II/i);

      const heading = document.querySelector("main h1");
      assert.match(heading?.textContent ?? "", /Four Star General/i);
      assert.doesNotMatch(heading?.textContent ?? "", /Operation Overlord/i);

      const hero = heading?.closest("main")?.textContent ?? "";
      assert.match(hero, /tactical/i);
      assert.doesNotMatch(hero, /Operation Overlord/i);
    });
  } finally {
    page.window.close();
  }
});

registerTest("FSG_LANDING_PRODUCT_ENTRY_ROUTE", async ({ Given, When, Then }) => {
  const page = readLanding();
  try {
    const document = page.window.document;
    await Given("a visitor at the game-level public entry", () => {});
    await When("the primary launch action is inspected", () => {});
    await Then("it opens the game selector instead of forcing a campaign route", () => {
      const primary = document.querySelector<HTMLAnchorElement>("main a.btn-primary");
      assert.ok(primary, "The opening hero needs one primary launch action");
      assert.equal(primary.getAttribute("href"), "/play");
      assert.match(primary.textContent ?? "", /Play Now/i);
      assert.equal(document.querySelector('main a.btn-primary[href*="mode=campaign"]'), null);
      assert.ok(!primary.hasAttribute("onclick"), "Launch must remain a native navigable link");
      assert.notEqual(primary.getAttribute("aria-disabled"), "true");
    });
  } finally {
    page.window.close();
  }
});

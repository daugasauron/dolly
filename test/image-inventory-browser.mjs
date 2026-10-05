import { browserTest } from "./browser.mjs";
import { acceptImage } from "../scripts/accept-release.mjs";

// Release acceptance (scripts/accept-release.mjs) on this checkout: a build
// worker checks each image's sealed manifest; display images also boot.
await browserTest("image inventory", { timeout: 900_000 }, async ({ browser, server }) => {
  for (const image of ["default", "system-build"]) await acceptImage(browser, server, image);
});

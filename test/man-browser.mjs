// man and --help in the image people open: every command on PATH has a page,
// Dolly's own commands answer --help, and a package's pages arrive with it
// (test/cases/man.json).
import { browserTest, runSteps } from "./browser.mjs";
import manCases from "./cases/man.json" with { type: "json" };

await browserTest("man and --help", { image: manCases.image, timeout: 300_000 }, async ({ server, open }) => {
  const { submit } = await open();
  await runSteps(submit, manCases);
});

// The browser a demo test runs in: the one DOLLY_BROWSER names. Without it, importing this
// runs the test again in each browser, a process of its own each (so that no state of one run
// reaches the other), and ends with a failure's status, else 77 when both skipped.
import { spawnSync } from "node:child_process";

export const browsers = process.env.DOLLY_BROWSER ? [process.env.DOLLY_BROWSER] : runInEachBrowser();
function runInEachBrowser() {
  const statuses = ["chromium", "firefox"].map(browser => spawnSync(process.execPath,
    [...process.execArgv, ...process.argv.slice(1)], { stdio: "inherit", env: { ...process.env, DOLLY_BROWSER: browser } }).status ?? 1);
  process.exit(statuses.find(status => status !== 0 && status !== 77) ?? (statuses.every(status => status === 77) ? 77 : 0));
}

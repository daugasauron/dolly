// Lean in default, as a person installs it: amy installs the package with cc
// and libuv, which it names; lean runs a program, accepts theorems proved by
// rfl, decide, simp and omega and rejects a false one; lake makes a package
// and builds it, cc compiles the C Lean emits, and the program runs.
// Usage: node demos/lean/test/lean-browser.mjs [chromium|firefox ...]
import { demoTest, writeCommand } from "../../browser.mjs";

const browsers = process.argv.length > 2 ? process.argv.slice(2) : ["chromium", "firefox"];
const program = `def main : IO Unit := do
  let squares := (List.range 10).map (· ^ 2)
  IO.println s!"{squares.foldl (· + ·) 0} {String.join (squares.take 4 |>.map toString)}"`;
const theorems = `theorem byRfl : 2 + 2 = 4 := rfl
theorem byDecide : 37 % 5 = 2 ∧ 10 < 100 := by decide
theorem bySimp (xs : List Nat) : (xs ++ []).length = xs.length := by simp
theorem byOmega (x y : Nat) (h : x < y) : x + 1 ≤ y ∧ 2 * x < 2 * y := by omega`;
const falsehood = "theorem wrong : 2 + 2 = 5 := by decide";

for (const browser of browsers) {
  await demoTest("lean", { image: "default", timeout: 1_200_000, browser }, async ({ open }) => {
    const { run } = await open();
    await run("amy install lean");
    await run(`mkdir /tmp/lean-check && cd /tmp/lean-check && ${writeCommand("squares.lean", program)} && ` +
      `${writeCommand("theorems.lean", theorems)} && ${writeCommand("wrong.lean", falsehood)}`);
    await run("cd /tmp/lean-check && test \"$(lean --run squares.lean)\" = '285 0149'");
    await run("cd /tmp/lean-check && lean theorems.lean");
    await run("cd /tmp/lean-check && lean wrong.lean > /dev/null", 1);
    await run("cd /tmp && lake new greeting && cd greeting && lake build && test \"$(.lake/build/bin/greeting)\" = 'Hello, world!'");
  });
}

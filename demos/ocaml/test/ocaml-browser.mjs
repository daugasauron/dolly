// OCaml in default, as a person installs it: amy installs the package; the
// toplevel evaluates a phrase typed at the terminal; ocamlc compiles a
// program with unix and str, which runs as a command and spawns another
// through a pipe, a program that runs a domain and a thread, and one whose
// processor time advances.
// Usage: node demos/ocaml/test/ocaml-browser.mjs [chromium|firefox ...]
import { demoTest, shellPrompt, writeCommand } from "../../browser.mjs";

const browsers = process.argv.length > 2 ? process.argv.slice(2) : ["chromium", "firefox"];
const words = `let () =
  let input, output = Unix.pipe () in
  let pid = Unix.create_process "echo" [| "echo"; "one two  three" |] Unix.stdin output Unix.stderr in
  Unix.close output;
  let line = input_line (Unix.in_channel_of_descr input) in
  let _, status = Unix.waitpid [] pid in
  let words = Str.split (Str.regexp " +") line in
  Printf.printf "%d %s %b\\n" (List.length words) (String.concat "," words) (status = Unix.WEXITED 0)`;
const domains = `let () =
  let domain = Domain.spawn (fun () -> List.fold_left ( + ) 0 (List.init 1001 Fun.id)) in
  let result = ref 0 in
  Thread.join (Thread.create (fun () -> result := 5050) ());
  Printf.printf "%d %d\\n" (Domain.join domain) !result`;

// Sys.time and Unix.times advance while a program computes.
const time = `let () =
  let started = Sys.time () and sum = ref 0 in
  for i = 1 to 2_000_000 do sum := !sum + i done;
  Printf.printf "%b %b\\n" (Sys.time () > started && !sum > 0) ((Unix.times ()).Unix.tms_utime > 0.)`;

for (const browser of browsers) {
  await demoTest("ocaml", { image: "default", timeout: 300_000, browser }, async ({ open }) => {
    const { run, input, waitText } = await open();
    await run("amy install ocaml");
    await input("ocaml\r");
    await waitText(/^# ?$/m);
    await input("List.fold_left ( + ) 0 [20; 22];;\r");
    await waitText(/^- : int = 42$/m);
    await input("#quit;;\r");
    await waitText(shellPrompt);

    await run(`mkdir /tmp/ocaml-words && cd /tmp/ocaml-words && ${writeCommand("words.ml", words)} && ${writeCommand("domains.ml", domains)}`);
    await run("cd /tmp/ocaml-words && ocamlc -I +unix -I +str unix.cma str.cma words.ml -o /usr/bin/words");
    await run("test \"$(words)\" = '3 one,two,three true'");
    await run("cd /tmp/ocaml-words && ocamlc -I +unix -I +threads unix.cma threads.cma domains.ml -o domains && " +
      "test \"$(./domains)\" = '500500 5050'");
    await run(`cd /tmp/ocaml-words && ${writeCommand("time.ml", time)} && ocamlc -I +unix unix.cma time.ml -o time && test "$(./time)" = 'true true'`);
  });
}

// The Go toolchain in a go-tools session: go build compiles a program that
// starts a child, pipes and sleeps, and the program runs; go run; gofmt finds
// and fixes a file; esbuild, built by go, bundles TypeScript.
// Usage: node demos/go/test/go-browser.mjs
import { demoTest, writeCommand } from "../../browser.mjs";

const program = `package main

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"
)

func main() {
	out, err := exec.Command("echo", "child").Output()
	if err != nil {
		panic(err)
	}
	done := make(chan string)
	go func() { time.Sleep(10 * time.Millisecond); done <- "slept" }()
	r, w, _ := os.Pipe()
	go func() { fmt.Fprint(w, "piped"); w.Close() }()
	piped := make([]byte, 5)
	n, _ := r.Read(piped)
	fmt.Println("GO-OK", strings.TrimSpace(string(out)), <-done, string(piped[:n]), len(os.Args))
}
`;
for (const browser of ["chromium", "firefox"]) {
  await demoTest("go", { image: "go-tools", browser, timeout: 900_000 }, async ({ open }) => {
    const { run } = await open();
    await run("mkdir -p /tmp/hello && cd /tmp/hello");
    await run(writeCommand("main.go", program));
    await run("go build -o hello main.go && ./hello a b > out.txt && test \"$(cat out.txt)\" = 'GO-OK child slept piped 3'");
    await run("test \"$(go run main.go)\" = 'GO-OK child slept piped 1'");
    await run(writeCommand("messy.go", "package main\nfunc main( ) { println( 1 ) }"));
    await run("test \"$(gofmt -l messy.go)\" = messy.go && gofmt -w messy.go && test -z \"$(gofmt -l messy.go)\"");
    await run(writeCommand("app.ts", "const answer: number = 6 * 7\nexport default answer"));
    await run("esbuild app.ts --format=esm --outfile=app.js && grep -q 'answer = 6 \\* 7' app.js");
  });
}

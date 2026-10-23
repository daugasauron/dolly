// The Go toolchain in a go-tools session, under the page's default HTTP
// policy: go build compiles a program that starts a child, pipes and sleeps,
// and the program runs; go run; gofmt finds and fixes a file; esbuild, built
// by go, bundles TypeScript; go get fetches a module from proxy.golang.org
// (checked against sum.golang.org) and a program built with it runs; http.Get
// reads an HTTPS URL; signal.Notify receives Ctrl-C and SIGTERM; syscall.Exec
// replaces the program.
// Usage: node demos/go/test/go-browser.mjs
import assert from "node:assert/strict";
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
const uuid = `package main

import (
	"fmt"

	"github.com/google/uuid"
)

func main() {
	fmt.Println("UUID-OK", uuid.NewSHA1(uuid.NameSpaceURL, []byte("https://dolly")).String())
}
`;
const get = `package main

import (
	"fmt"
	"io"
	"net/http"
)

func main() {
	resp, err := http.Get("https://proxy.golang.org/github.com/google/uuid/@v/v1.6.0.mod")
	if err != nil {
		panic(err)
	}
	body, _ := io.ReadAll(resp.Body)
	fmt.Printf("%d %s", resp.StatusCode, body)
}
`;
const notify = `package main

import (
	"fmt"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	fmt.Println("SIGNAL-READY")
	fmt.Println("GOT", <-c)
	os.Exit(3)
}
`;
const exec = `package main

import (
	"fmt"
	"os"
	"syscall"
)

func main() {
	fmt.Println("missing:", syscall.Exec("/no/such/program", []string{"x"}, os.Environ()))
	fmt.Println("exec returned:", syscall.Exec("/bin/echo", []string{"echo", "replaced", "by", "exec"}, nil))
}
`;
for (const browser of ["chromium", "firefox"]) {
  await demoTest("go", { image: "go-tools", browser, timeout: 1_800_000 }, async ({ open }) => {
    const { run, start, page, text, waitText } = await open();
    await run("mkdir -p /tmp/hello && cd /tmp/hello");
    await run(writeCommand("main.go", program));
    await run("go build -o hello main.go && ./hello a b > out.txt && test \"$(cat out.txt)\" = 'GO-OK child slept piped 3'");
    await run("test \"$(go run main.go)\" = 'GO-OK child slept piped 1'");
    await run(writeCommand("messy.go", "package main\nfunc main( ) { println( 1 ) }"));
    await run("test \"$(gofmt -l messy.go)\" = messy.go && gofmt -w messy.go && test -z \"$(gofmt -l messy.go)\"");
    await run(writeCommand("app.ts", "const answer: number = 6 * 7\nexport default answer"));
    await run("esbuild app.ts --format=esm --outfile=app.js && grep -q 'answer = 6 \\* 7' app.js");

    await run("mkdir -p /tmp/module && cd /tmp/module && go mod init example.com/probe");
    await run(writeCommand("main.go", uuid));
    await run("go get github.com/google/uuid@v1.6.0");
    await run("go build -o probe . && test \"$(./probe)\" = 'UUID-OK 0fd792de-d7a1-508e-9b94-1cda8771874d'");
    await run("mkdir -p /tmp/get && cd /tmp/get");
    await run(writeCommand("get.go", get));
    await run("test \"$(go run get.go)\" = '200 module github.com/google/uuid'");

    await run("mkdir -p /tmp/signal && cd /tmp/signal");
    await run(writeCommand("notify.go", notify));
    await run("go build -o notify notify.go");
    const interrupted = start("./notify");
    await waitText(/\nSIGNAL-READY/);
    await page.keyboard.press("Control+c");
    assert.equal(await interrupted.done, 3, await text());
    await waitText(/\nGOT interrupt/);
    await run("./notify > term.txt & pid=$!; sleep 1; kill -TERM $pid; wait $pid; test $? = 3 && grep -q 'GOT terminated' term.txt");

    await run(writeCommand("exec.go", exec));
    await run("go build -o exec exec.go && ./exec > exec.txt");
    await run("grep -qx 'missing: No such file or directory' exec.txt && grep -qx 'replaced by exec' exec.txt && ! grep -q 'exec returned' exec.txt");
  });
}

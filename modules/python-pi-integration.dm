DOLLY 2
MODULE python-pi-integration

# This layer is meaningful only when both Python/Bonnie and Pi are present.
REQUIRES TOOL bonnie
REQUIRES TOOL pi
REQUIRES TOOL python

FILE /home/dolly/.dollyrc
    printf '\033[33mDOLLY / PYTHON + PI\033[0m\n'
    printf 'Pi, CPython, Bonnie, and native extension builds all run inside Dolly.\n'
    printf 'Try: ! python --version | ! bonnie install requests | ask Pi to debug a package build\n'
    printf 'Source extension builds stream progress and can take several minutes.\n\n'
FILE /home/dolly/.pi/agent/skills/bonnie/SKILL.md
    ---
    name: bonnie
    description: Install and troubleshoot Python packages inside Dolly with the Bonnie package manager.
    ---
    
    # Bonnie
    
    Bonnie is Dolly's Python package manager. Use it instead of invoking `pip`
    directly: Bonnie keeps package metadata and artifact downloads on Dolly's one
    browser HTTP broker, then builds and installs entirely inside the Wasm sandbox.
    
    ## Normal workflow
    
    Inspect the environment first, then install the smallest explicit requirement:
    
    ```sh
    python --version
    bonnie install requests
    python -c 'import requests; print(requests.__version__)'
    ```
    
    Version constraints use ordinary Python requirement syntax:
    
    ```sh
    bonnie install 'package>=1.2,<2'
    ```
    
    Pure-Python wheels install quickly. If no compatible wheel exists, Bonnie
    selects the pinned source distribution and drives its PEP 517 build with the
    in-sandbox C/C++ compiler, Make, Ninja, and Meson compatibility surface. A
    large native build such as NumPy or Pandas can take several minutes. Do not
    mistake a long compile for a network hang; keep the command running while
    output is advancing, and use Ctrl+C when the user wants to cancel it.
    
    ## Troubleshooting
    
    - Run Bonnie through Slop, never Bash: `bonnie install PACKAGE`.
    - Preserve the first compiler error and the final Bonnie diagnostic when a
      build fails; later PEP 517 lines are often only summaries.
    - Verify an install with a small `python -c` import before changing sources.
    - Packages that require native sockets, host subprocesses, threads, or an
      unsupported system library may need a Dolly target configuration. Never add
      a Node, browser `fetch`, or native-host fallback.
    - Installed state belongs to the current in-memory session. Export or download
      user work that must survive closing the sandbox.

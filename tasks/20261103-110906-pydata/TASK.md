# A Python image with NumPy, Pandas, Matplotlib and the common libraries, built once, that other recipes COPY from

- STATUS: OPEN
- PRIORITY: 350
- TAGS: python,image,demo,packages

Owner (2026-11-03, high priority): "I want another demo image with a bunch of common python
libraries preinstalled (cached). pandas, numpy, matplotlib etc. Ideally, this also means this can
be used as a "build image" such that other builds can just copy the premade built packages using
Dollyfile syntax to get the specific python packages needed."

What exists (2026-11-03): CPython built in Dolly (`demos/python`); pip in a session builds NumPy
2.5.2 and Pandas 3.0.5 from their sdists with Dolly's `cc` and, for Meson projects, Ninja
(`demos/python/test/python-browser.mjs`, `DOLLY_PYTHON_PACKAGES=1` for Pandas; the recipe's
comments on flags). `COPY RECIPE SHA256 SOURCE DESTINATION` copies a retained file or tree out of
a completed image of any role (`docs/dollyfile.md`).

The shape to build:
- A build image (a toolchain's role) that compiles the libraries once, inside Dolly, from pinned
  sdists fetched by `SOURCE` (an image build reaches no index; pip installs from the staged files
  with `--no-index`), at the optimisation their upstream releases use, and keeps each library's
  installed tree so that another recipe can `COPY` exactly the ones it needs (a library and its
  dependencies, documented per library, or one directory per library).
- A demo application image FROM `python` with the set installed: a session imports them at once,
  with nothing to build or fetch. Its demo test opens it in Chromium and Firefox and runs a short
  script per library (a NumPy computation, a Pandas frame, a Matplotlib figure saved as PNG).
- The set: NumPy, Pandas (with python-dateutil, pytz/tzdata, six), Matplotlib (with Pillow,
  kiwisolver, contourpy, cycler, fonttools, pyparsing, packaging; its Agg backend, no GUI), and
  others common in data work if they build (SciPy needs Fortran: say what it would take).
- Sizes measured (each library's tree, the images' packs), build times, and what a recipe that
  `COPY`s only NumPy gets.

Done when: both images are in the catalog, built in a round; the demo test passes in Chromium and
Firefox; a recipe in the repository (or the test) shows `COPY` of one library from the build image
working; `demos/python/README.md` says how to use it.

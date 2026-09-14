# Merge and publish the GPU checkpoint on both sites

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: release,gpu

Merge the overnight core cleanup, complete catalog restoration, fluid image and
in-sandbox local inference to main. Publish the full 39-image domain catalog,
retain its predecessor assets, and publish the GitHub Pages selection.

The bundled model makes the GitHub selection exceed its 1 GB site limit.
The user approved linking Pi Local and Dollyfile Studio to daugasauron.com;
keep their menu entries and redirect their open/rebuild/Dollyfile bookmarks.
Fluid must run on both hosts. Agents at play stays domain-only.

Merged by fast-forward and pushed main. The domain reuses the complete verified
release from `b0f02f0`; GitHub's packaging and redirect changes are in `c42bb9a`.
Both source revisions are on main. No image recompilation was needed.

Published [daugasauron.com](https://daugasauron.com/) with all 39 images and
all three predecessor releases retained. Published
[GitHub Pages](https://daugasauron.github.io/dolly/) through successful
[workflow 34828401705](https://github.com/daugasauron/dolly/actions/runs/34828401705).
Its 867 MB export contains 32 local images and two domain links.

Public Chrome checks passed on both sites: all 219 menu links, default boot,
ripgrep/fd, named-session restoration, rebuild start/cancel, and GitHub's six
bookmark redirects. Delivered runtime/source hashes match the sealed releases.
Fluid rendered and passed its compute check on NVIDIA through a virtual display
on both hosts, with no frame readback. The domain's bundled LLM produced answers,
reused weights, cancelled/restarted, and refreshed with zero model part downloads;
external model services were blocked throughout. No browser page errors.

Deployment IDs, artifact hashes and browser evidence are in
[evidence.json](evidence.json). The complete checkpoint's earlier image and
Chrome/Firefox verification remains in
[the catalog task](../20260914-073000-catalog-restore/TASK.md).

# Firefox: show which GPU WebGPU uses, and whether it can be switched

- STATUS: OPEN
- PRIORITY: 55
- TAGS: gpu,firefox,investigation

Owner (2026-10-06): "I suspect that firefox currently picks up integrated
graphics instead of my nvidia blackwell for webgpu. This should be more clear,
and also if that is the case, is it possible to switch somehow? This is a low
prio investigation task."

Known (`20261005-131646-webgpu-any-gpu`, measured with Playwright under Xvfb on
this machine: NVIDIA RTX 5070 and an AMD integrated GPU):

- `gpu@0` asks for `powerPreference: "high-performance"`; with it Firefox got
  the NVIDIA adapter, without a preference the integrated one.
- Firefox hides every adapter name, so the page's indicator can only say
  `unnamed WebGPU adapter`: the owner cannot see which card is in use.
- The Mesa device-select layer forces one: `MESA_VK_DEVICE_SELECT='10de:2f04!'`.

Not known: what the owner's desktop Firefox picks (a real desktop session, not
Xvfb), and whether anything the page can read tells the adapters apart.

## Work

- Establish which adapter a desktop Firefox session actually gets here, by a
  means that does not depend on the hidden name (`about:support`, limits and
  features that differ between the two adapters, a short timing probe).
- Make the indicator say what it can truthfully say when the name is hidden,
  and point to how the user checks and switches (browser setting or launch
  environment); record whether a page can influence the choice beyond the
  power preference.

## Done when

- The answer for this machine is recorded with its evidence, the indicator and
  `docs/gpu.md` say how to tell and how to switch, and no new browser authority
  was added to find out.

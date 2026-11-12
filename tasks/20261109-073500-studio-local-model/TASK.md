# Dollyfile Studio without the local model

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: studio

Owner (2026-11-09): "I want to remove the local model from dolly studio, it makes it too big."

Studio's recipe (`demos/studio/Dollyfile-dollyfile-studio`) installs `pi-llm`
(`demos/local-llm/Dollyfile-pi-llm`): dolly-llama, the bundled Qwen3.5-2B, and Pi settings that
make it the default provider and model. In `work/godot`'s dist, Studio's snapshot is 1,674,832,570
bytes, of which `pi-llm`'s is 1,396,399,526.

Done when Studio no longer installs `pi-llm`, Pi in Studio starts on its remote providers as
before the local model, Studio's README and texts stop offering local models as part of it
(`demos/studio/README.md` lines 3 and 8), Studio's tests pass, and its snapshot size is recorded
before and after. Local models stay as their own images and packages (`pi-local`, `pi-llm`).

## Closed (2026-11-12)

Done in `0e9957966` (2026-11-11, on main): Studio's recipe installs no `pi-llm` and declares
no `gpu@0`, which only it needed; Pi in Studio uses a provider the user chooses with `/model`;
`demos/studio/README.md`, its skill and its Pi extension no longer offer a local model; `pi-local`
and `pi-llm` keep the local models and their test. The snapshot: 1,674,832,570 bytes before
(`work/godot`'s dist, 2026-11-09), 269,437,923 after (72,889,831 bytes of packs; the root's dist
at main `0bacb83d7`). Studio's test passed in Chromium in the round of 2026-11-11, on `7269d81cd`,
which holds the change (`build/round-1111-evidence/demos.log`).

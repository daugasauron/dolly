# Dollyfile Studio without the local model

- STATUS: OPEN
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

## State (2026-11-09)

Not started.

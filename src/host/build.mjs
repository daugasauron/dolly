// Wasm-initiated image builds. No Wasm imports: enabling build@0 only lets the
// page admit POST https://build.dolly.invalid/v1/builds (src/local-services.mjs)
// once the image ENTRY starts. Page-initiated rebuilds never need it.
export const contract = Object.freeze({ name: "build", version: 0, dependencies: ["http@0"], imports: [] });

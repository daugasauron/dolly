// A dependency-free extension fetched by Pi during the real-provider browser
// proof. It deliberately has no authority except Pi's existing extension API.
export default function installedDollyExtension(pi) {
  pi.registerTool({
    name: "dolly_installed_probe",
    label: "installed probe",
    description: "Return Dolly's deterministic installed-extension proof marker.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    async execute() {
      return {
        content: [{ type: "text", text: "DOLLY-INSTALLED-EXTENSION-OK" }],
        details: {},
      };
    },
  });
}

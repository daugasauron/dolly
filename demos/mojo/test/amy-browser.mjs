// This demo's packages, each installed alone into a default session and used (amy-cases.json).
import { amyCases } from "../../../test/amy-sessions.mjs";

await amyCases(new URL("./amy-cases.json", import.meta.url));

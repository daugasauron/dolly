import { createHash } from "node:crypto";

// The lowercase hex SHA-256 of bytes or text, as recipes and records pin them.
export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

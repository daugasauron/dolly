import { DOLLY_HOST_RECORD_BYTES as recordBytes, DOLLY_HOST_NAME_BYTES as nameBytes,
  DOLLY_HOST_MAX_RECORDS as maxRecords } from "./abi.mjs";

const pattern = /^([a-z][a-z0-9-]{0,30})@(0|[1-9][0-9]{0,4})$/;

export function hostRequirement(value) {
  const match = typeof value === "string" && pattern.exec(value);
  if (!match || Number(match[2]) > 65535) throw new TypeError(`invalid host requirement: ${value}`);
  return { name: match[1], version: Number(match[2]) };
}

export function hostRequirements(values = []) {
  if (!Array.isArray(values)) throw new TypeError("invalid host requirements");
  const versions = new Map();
  for (const value of values) {
    const { name, version } = hostRequirement(value);
    if (versions.has(name) && versions.get(name) !== version) throw new Error(`conflicting host ABI requirements for ${name}`);
    versions.set(name, version);
  }
  if (versions.size > maxRecords) throw new TypeError("too many host requirements");
  return [...versions].sort(([a], [b]) => a.localeCompare(b)).map(([name, version]) => `${name}@${version}`);
}

export function executableHostRequirements(module) {
  const required = [], decoder = new TextDecoder("utf-8", { fatal: true });
  for (const { name, data } of module.customSectionData) {
    if (name !== "dolly.host") continue;
    if (data.length === 0 || data.length % recordBytes || required.length + data.length / recordBytes > maxRecords) {
      throw new Error("invalid dolly.host record count");
    }
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    for (let offset = 0; offset < data.length; offset += recordBytes) {
      const bytes = data.subarray(offset, offset + nameBytes), end = bytes.indexOf(0);
      if (end < 1 || bytes.subarray(end).some(byte => byte !== 0) || view.getUint32(offset + nameBytes + 4, true) !== 0) {
        throw new Error("invalid dolly.host record");
      }
      required.push(`${decoder.decode(bytes.subarray(0, end))}@${view.getUint32(offset + nameBytes, true)}`);
    }
  }
  return hostRequirements(required);
}

export function checkHostAbi(required, available) {
  const provided = new Set(hostRequirements(available));
  for (const requirement of hostRequirements(required)) {
    if (!provided.has(requirement)) throw new Error(`Required host ABI ${requirement} is unsupported`);
  }
}

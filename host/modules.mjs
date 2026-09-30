import { hostManifests } from "./manifests.mjs";
import { hostRequirement, hostRequirements } from "./requirements.mjs";
import { DOLLY_ERRNO as E } from "../dist/dolly-errno.mjs";

// This fixed registry is trusted embedding code. Images select no JS or Worker URLs:
// each module's provider is the file its manifest names.
const definitions = await Promise.all(hostManifests.map(async manifest =>
  ({ ...await import(new URL(manifest.host, manifest.url).href), contract: manifest })));
export const hostContracts = Object.freeze(definitions.map(module => module.contract));
export const buildHost = Object.freeze(["runtime@0", "http@0", "threads@0"]);
const byName = new Map(definitions.map(module => [module.contract.name, module]));
const owners = new Map();
for (const module of definitions) for (const name of module.contract.imports) {
  if (owners.has(name)) throw new Error(`duplicate host import owner: ${name}`);
  owners.set(name, module.contract.name);
}

export async function createHost(side, enabled, { send, resources = {}, configuration = {} } = {}) {
  if (!["browser", "worker"].includes(side)) throw new TypeError("invalid host side");
  const selected = hostRequirements(enabled), instances = new Map(), reasons = new Map(), messages = new Map();
  const started = new Set(), pending = new Map(), options = {}, transfers = [], config = {};
  let disposed = false;
  function requireModules(requirements) {
    for (const value of hostRequirements(requirements)) {
      const { name, version } = hostRequirement(value), module = byName.get(name);
      const reason = !module ? "unknown host module" : module.contract.version !== version
        ? `host provides ABI ${module.contract.version}` : reasons.get(name) ?? (!instances.has(name) ? "not enabled by the host" : null);
      if (reason) throw new Error(`Required host module ${value} is unavailable: ${reason}`);
    }
  }
  const get = name => instances.get(name);
  // Page UI across modules: the first module that claims a key event takes it
  // from the display and may act on it; a module drawing over the display
  // canvas reports the pixel size pointer input maps to.
  function claimsKey(event) {
    for (const instance of instances.values()) {
      const claim = instance.claimsKey?.(event);
      if (claim) return claim;
    }
    return false;
  }
  const surfaceSize = () => [...instances.values()].find(instance => instance.surfaceSize)?.surfaceSize;
  async function attach(value, visiting = new Set()) {
    const { name, version } = hostRequirement(value), module = byName.get(name);
    if (instances.has(name) || reasons.has(name)) return;
    if (!module || version !== module.contract.version) {
      reasons.set(name, !module ? "unknown host module" : `host provides ABI ${module.contract.version}`); return;
    }
    if (visiting.has(name)) throw new Error(`host module dependency cycle: ${name}`);
    visiting.add(name);
    for (const dependency of module.contract.dependencies) await attach(dependency, visiting);
    visiting.delete(name);
    try { requireModules(module.contract.dependencies); }
    catch (error) { reasons.set(name, error.message); return; }
    if (side === "browser") {
      const reason = await module.check?.();
      if (reason) { reasons.set(name, reason); return; }
    }
    const dependency = name => {
      if (!module.contract.dependencies.some(value => hostRequirement(value).name === name)) {
        throw new Error(`${module.contract.name} accessed undeclared dependency ${name}`);
      }
      return get(name);
    };
    const instance = module[side]?.({ ...resources, send, get: dependency,
      service: () => { for (const instance of instances.values()) instance.service?.(); },
      claimsKey, surfaceSize,
      abi: hostContracts.map(({ name, version }) => `${name}@${version}`),
      configuration: configuration[name] ?? {} }) ?? {};
    instances.set(name, instance);
    for (const [key, value] of Object.entries(instance.options ?? {})) {
      if (key in options) throw new Error(`duplicate host option: ${key}`);
      options[key] = value;
    }
    for (const [type, handler] of Object.entries(instance.messages ?? {})) {
      if (messages.has(type)) throw new Error(`duplicate host message: ${type}`);
      messages.set(type, handler);
    }
    config[name] = instance.configuration ?? {};
    transfers.push(...instance.transfers ?? []);
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const wait of pending.values()) wait.reject(new Error("host providers closed"));
    pending.clear();
    for (const instance of [...instances.values()].reverse()) instance.dispose?.();
  }
  try {
    await attach("runtime@0");
    for (const value of selected) await attach(value);
    requireModules(["runtime@0"]);
  } catch (error) { dispose(); throw error; }
  return {
    get, options, transfers, configuration: config,
    enabled: [...instances.keys()].map(name => `${name}@${byName.get(name).contract.version}`),
    unavailable: Object.fromEntries(reasons), require: requireModules, dispose,
    // The Worker calls this after restoring the system image and before starting
    // image-phase modules, in registry order.
    async imageRestored(context) {
      for (const instance of instances.values()) await instance.imageRestored?.(context);
    },
    // The page calls this once the image ENTRY may run, right before it lets
    // the Worker start it: modules may then show their UI and admit services.
    entryStarted(context) {
      return Promise.all([...instances.values()].map(instance => instance.entryStarted?.(context)));
    },
    bindImports(module, imports) {
      for (const entry of WebAssembly.Module.imports(module)) {
        const name = `${entry.module}.${entry.name}`, owner = owners.get(name);
        if (!owner) throw new Error(`unowned browser import: ${name}`);
        if (!instances.has(owner)) imports[entry.module][entry.name] = () => -E.ENOSYS;
        else if (owner !== "runtime") {
          const binding = instances.get(owner).bindings?.[name];
          if (typeof binding !== "function") throw new Error(`missing host binding: ${name}`);
          imports[entry.module][entry.name] = binding;
        }
      }
    },
    async handle(message) {
      if (disposed) return false;
      if (message.type === "host-ready-ack" && side === "worker") {
        const wait = pending.get(message.module);
        if (!wait) throw new Error("unexpected host acknowledgement");
        pending.delete(message.module);
        if (message.error) wait.reject(new Error(message.error)); else wait.resolve();
        return true;
      }
      if (message.type === "host-ready" && side === "browser") {
        try {
          const instance = get(message.module);
          if (!instance?.start || started.has(message.module)) throw new Error("invalid host provider handshake");
          started.add(message.module);
          await instance.start(message.descriptor);
          send({ type: "host-ready-ack", module: message.module });
        } catch (error) {
          send({ type: "host-ready-ack", module: message.module, error: error.message });
          throw error;
        }
        return true;
      }
      const handler = messages.get(message.type);
      if (!handler) return false;
      await handler(message);
      return true;
    },
    async start(phase, context) {
      if (side !== "worker" || disposed) throw new Error("host cannot initialize providers");
      for (const [name, instance] of instances) {
        if (byName.get(name).contract.phase !== phase || !instance.start) continue;
        if (started.has(name)) throw new Error(`host provider ${name} initialized twice`);
        started.add(name);
        const descriptor = await instance.start(context);
        if (descriptor === undefined) continue;
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => { pending.delete(name); reject(new Error(`host provider ${name} did not acknowledge initialization`)); }, 10_000);
          pending.set(name, { resolve: () => { clearTimeout(timer); resolve(); }, reject: error => { clearTimeout(timer); reject(error); } });
          send({ type: "host-ready", module: name, descriptor });
        });
      }
    },
  };
}

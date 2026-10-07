import { hostManifests, runtimes } from "./manifests.mjs";
import { hostRequirement, hostRequirements } from "./requirements.mjs";
import { DOLLY_ERRNO as E } from "../src/process-constants.mjs";

// This fixed registry is trusted embedding code. Images select no JS or Worker URLs:
// each module's provider is the file its manifest names.
const definitions = await Promise.all(hostManifests.map(async manifest =>
  ({ ...await import(new URL(manifest.host, manifest.url).href), contract: manifest })));
export const hostContracts = Object.freeze(definitions.map(module => module.contract));
// What a build enables beside the runtime its image declares: the broker the
// engine fetches sources through, the threads its toolchain uses and the
// modules its compilers and interpreters load.
export const buildHost = Object.freeze(["http@0", "threads@0", "dso@0"]);
export const buildHostFor = declared => [...declared.filter(value => runtimes.includes(value)), ...buildHost];

// A module may select what a route boots, as a saved session names its image:
// at most one does, and the page then requires it. The selection carries the
// image, a bootstrap label, the custom image record it restores and the
// module's configuration, keyed for createHost.
export async function selectBoot(route) {
  let selection = null;
  for (const module of definitions) {
    const selected = await module.boot?.(route);
    if (!selected) continue;
    if (selection) throw new Error("two host modules selected the boot");
    const { name, version } = module.contract;
    selection = { ...selected, module: `${name}@${version}`, configuration: { [name]: selected.configuration } };
  }
  return selection;
}
const byName = new Map(definitions.map(module => [module.contract.name, module]));
const owners = new Map();
for (const module of definitions) for (const name of module.contract.imports) {
  if (owners.has(name)) throw new Error(`duplicate host import owner: ${name}`);
  owners.set(name, module.contract.name);
}

export async function createHost(side, enabled, { send, resources = {}, configuration = {} } = {}) {
  if (!["browser", "worker"].includes(side)) throw new TypeError("invalid host side");
  const selected = hostRequirements(enabled), instances = new Map(), reasons = new Map(), messages = new Map();
  // The kernel is the one requested module that provides it; a module others
  // only depend on does not make it one.
  const kernels = selected.filter(value => runtimes.includes(value));
  const started = new Set(), pending = new Map(), transfers = [], config = {};
  // The page API (window.__dolly) by property descriptor, so module getters
  // stay live; a child build host's configuration; what an opened result tab
  // or restored session inherits from this page.
  const page = {}, builder = {}, inherited = {};
  // What executables may require: name@version -> the ABI digest its provider
  // implements, for exactly the modules the image declares (see admit).
  const admittedAbi = new Map();
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
  // from the guest's input and may act on it; a module drawing over the
  // display canvas reports the pixel size pointer input maps to.
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
      abi: admittedAbi,
      configuration: configuration[name] ?? {} }) ?? {};
    instances.set(name, instance);
    for (const [type, handler] of Object.entries(instance.messages ?? {})) {
      if (messages.has(type)) throw new Error(`duplicate host message: ${type}`);
      messages.set(type, handler);
    }
    config[name] = instance.configuration ?? {};
    transfers.push(...instance.transfers ?? []);
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(instance.page ?? {}))) {
      if (key in page) throw new Error(`duplicate page API member: ${key}`);
      Object.defineProperty(page, key, descriptor);
    }
    if (instance.builder) builder[name] = instance.builder;
    for (const [key, value] of Object.entries(instance.inherited ?? {})) {
      if (key in inherited) throw new Error(`duplicate inherited record: ${key}`);
      inherited[key] = value;
    }
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const wait of pending.values()) wait.reject(new Error("host providers closed"));
    pending.clear();
    for (const instance of [...instances.values()].reverse()) instance.dispose?.();
  }
  try {
    for (const value of selected) await attach(value);
    if (kernels.length !== 1) {
      // A requested module this page lacks may be the runtime the image declares.
      requireModules(selected);
      throw new Error(kernels.length ? `${kernels.join(" and ")} both provide the kernel`
        : `no enabled host module provides the kernel: add REQUIRES HOST ${runtimes.join(" or ")}`);
    }
    requireModules(kernels);
  } catch (error) { dispose(); throw error; }
  const kernel = hostRequirement(kernels[0]).name;
  return {
    get, transfers, configuration: config, page, builder, inherited,
    kernel: instances.get(kernel),
    enabled: [...instances.keys()].map(name => `${name}@${byName.get(name).contract.version}`),
    require: requireModules, dispose,
    // Executables may use only the modules the image declares. A declared module
    // this host does not enable (a build host) answers its calls with ENOSYS.
    admit(requirements) {
      admittedAbi.clear();
      for (const value of hostRequirements(requirements)) {
        const { name, version } = hostRequirement(value), module = byName.get(name);
        if (module?.digest && module.contract.version === version) admittedAbi.set(value, module.digest);
      }
    },
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
    // The page asks this when the image has ended, before it lets go of the
    // modules: the links ({ text, href }) each one offers beside "start again".
    ended: () => [...instances.values()].flatMap(instance => instance.ended?.() ?? []),
    // The kernel's whole import object: each import is the binding of the
    // module whose manifest owns it.
    imports(module) {
      const imports = {};
      for (const entry of WebAssembly.Module.imports(module)) {
        const name = `${entry.module}.${entry.name}`, owner = owners.get(name);
        if (!owner) throw new Error(`unowned browser import: ${name}`);
        const binding = instances.has(owner) ? instances.get(owner).bindings?.[name] : () => -E.ENOSYS;
        if (binding === undefined) throw new Error(`missing host binding: ${name}`);
        (imports[entry.module] ??= {})[entry.name] = binding;
      }
      return imports;
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

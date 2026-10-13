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

// `closed`: the embedding named the modules itself, so nena@0 enables no other.
export async function createHost(side, enabled, { send, resources = {}, configuration = {}, closed = false } = {}) {
  if (!["browser", "worker"].includes(side)) throw new TypeError("invalid host side");
  const selected = hostRequirements(enabled), instances = new Map(), reasons = new Map(), messages = new Map();
  // The kernel is the one requested module that provides it; a module others
  // only depend on does not make it one.
  const kernels = selected.filter(value => runtimes.includes(value));
  const started = new Set(), pending = new Map(), transfers = [], config = {};
  // nena@0: the acknowledgements of the Worker's side of a switch, the
  // switches in order, the context its providers start with and whether the
  // image ENTRY has started.
  const switched = new Map();
  let switching = Promise.resolve(), startContext, entryContext;
  // The page API (window.__dolly) by property descriptor, so module getters
  // stay live; a child build host's configuration; what an opened result tab
  // or restored session inherits from this page.
  const page = {}, builder = {}, inherited = {};
  // What executables may require: name@version -> the ABI digest its provider
  // implements, for exactly the modules the image declares (see admit) and
  // those its session enabled since (nena@0).
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
  async function attach(value, visiting = new Set(), checked = false) {
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
    if (side === "browser" && !checked) {
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
      abi: admittedAbi, modules: side === "browser" ? { list, enable, disable } : undefined,
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
  // What attach registered for one module, undone. Its provider lets go first,
  // as when the page ends, and then of what a runtime that goes on must not
  // keep: a service it registered, the thread provider.
  function detach(name) {
    const instance = instances.get(name);
    instance.dispose?.();
    instance.disabled?.();
    for (const type of Object.keys(instance.messages ?? {})) messages.delete(type);
    for (const key of Object.keys(instance.page ?? {})) delete page[key];
    for (const key of Object.keys(instance.inherited ?? {})) delete inherited[key];
    delete builder[name];
    delete config[name];
    instances.delete(name);
    started.delete(name);
    admittedAbi.delete(`${name}@${byName.get(name).contract.version}`);
  }
  // The Worker's side of a module starts once; a descriptor it returns is the
  // page side's to acknowledge.
  async function startProvider(name, instance, context) {
    if (started.has(name)) throw new Error(`host provider ${name} initialized twice`);
    started.add(name);
    const descriptor = await instance.start(context);
    if (descriptor === undefined) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(name); reject(new Error(`host provider ${name} did not acknowledge initialization`)); }, 10_000);
      pending.set(name, { resolve: () => { clearTimeout(timer); resolve(); }, reject: error => { clearTimeout(timer); reject(error); } });
      send({ type: "host-ready", module: name, descriptor });
    });
  }
  // Switching a module after boot, for the page side of nena@0 alone: an image
  // without that module has no caller, so its set stays what the page chose.
  // The page decides and goes first when enabling, last when disabling; the
  // Worker's side follows by message. Each resolves to null, or to one line
  // saying why not. A module whose manifest says `fixed` is never switched;
  // the modules others depend on (runtime@0, http@0) are among them.
  const requirementOf = ({ name, version }) => `${name}@${version}`;
  const list = () => hostContracts.map(contract => ({ name: contract.name, version: contract.version,
    gives: contract.gives, fixed: contract.fixed ?? "", enabled: instances.has(contract.name),
    declared: selected.includes(requirementOf(contract)) }));
  // Enabling hands the Worker's side what boot would have: the page side's
  // configuration and what it transfers, such as a canvas.
  const workerSwitch = (value, enabling, name = hostRequirement(value).name) => new Promise(resolve => {
    switched.set(value, resolve);
    if (enabling) send({ type: "host-switch", module: value, enabling, configuration: config[name] }, instances.get(name).transfers ?? []);
    else send({ type: "host-switch", module: value, enabling });
  });
  const serially = task => switching = switching.then(task, task);
  const enable = value => serially(async () => {
    const { name, version } = hostRequirement(value), module = byName.get(name);
    if (!module || module.contract.version !== version) return "this page has no such host module";
    if (instances.has(name)) return null;
    if (module.contract.fixed) return `fixed: ${module.contract.fixed}`;
    if (closed && !selected.includes(value)) return "the embedding of this page does not offer it";
    const missing = module.contract.dependencies.find(dependency => !instances.has(hostRequirement(dependency).name));
    if (missing) return `it needs ${missing}`;
    reasons.delete(name);
    try {
      // A browser that never answers a module's check must not hold every
      // later switch, nor the boot of a session that recorded the module.
      const unavailable = await Promise.race([module.check?.(),
        new Promise(resolve => setTimeout(resolve, 5000, "the browser did not answer in time"))]);
      if (unavailable) return unavailable;
      await attach(value, new Set(), true);
      if (!instances.has(name)) return reasons.get(name);
      const refusal = await workerSwitch(value, true);
      if (refusal) { detach(name); return refusal; }
      if (entryContext) await instances.get(name).entryStarted?.(entryContext);
    } catch (error) {
      if (instances.has(name)) { await workerSwitch(value, false); detach(name); }
      return error.message;
    }
    return null;
  });
  const disable = value => serially(async () => {
    const { name, version } = hostRequirement(value), module = byName.get(name);
    if (!module || module.contract.version !== version) return "this page has no such host module";
    if (!instances.has(name)) return null;
    if (module.contract.fixed) return `fixed: ${module.contract.fixed}`;
    const refusal = await workerSwitch(value, false);
    if (refusal) return refusal;
    detach(name);
    return null;
  });
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
    get enabled() { return [...instances.keys()].map(name => requirementOf(byName.get(name).contract)); },
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
      entryContext = context;
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
        // The kernel is instantiated once. An import of a module that can be
        // switched asks at each call who answers it now; a disabled one is ENOSYS.
        (imports[entry.module] ??= {})[entry.name] = byName.get(owner).contract.fixed ? binding
          : (...values) => instances.has(owner) ? instances.get(owner).bindings[name](...values) : -E.ENOSYS;
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
      if (message.type === "host-switch" && side === "worker") {
        const { name } = hostRequirement(message.module);
        let refusal = null;
        try {
          if (message.enabling) {
            configuration[name] = message.configuration;
            reasons.delete(name);
            await attach(message.module);
            const instance = instances.get(name);
            if (!instance) throw new Error(reasons.get(name));
            if (instance.start) await startProvider(name, instance, startContext);
            const { digest } = byName.get(name);
            if (digest) admittedAbi.set(message.module, digest);
          } else if (instances.has(name)) detach(name);
        } catch (error) {
          if (instances.has(name)) detach(name);
          refusal = error.message;
        }
        send({ type: "host-switch-ack", module: message.module, refusal });
        return true;
      }
      if (message.type === "host-switch-ack" && side === "browser") {
        switched.get(message.module)?.(message.refusal);
        switched.delete(message.module);
        return true;
      }
      const handler = messages.get(message.type);
      if (!handler) return false;
      await handler(message);
      return true;
    },
    async start(phase, context) {
      if (side !== "worker" || disposed) throw new Error("host cannot initialize providers");
      startContext = context;
      for (const [name, instance] of [...instances]) {
        if (byName.get(name).contract.phase === phase && instance.start) await startProvider(name, instance, context);
      }
    },
  };
}

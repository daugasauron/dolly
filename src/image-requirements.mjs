import { inspectDollyfile } from "./dollyfile-view.mjs";
import { hostRequirements } from "./host/requirements.mjs";

// Only FROM and USE propagate runtime demands. COPY imports files, not the
// source image's entry/workflow. The caller verifies each referenced digest.
export async function imageHostRequirements(source, load, stack = []) {
  if (stack.length >= 16) throw new Error("host requirement recipe depth exceeds 16");
  const recipe = inspectDollyfile(source), required = [...recipe.hostRequirements];
  for (const reference of [recipe.from, ...recipe.uses].filter(Boolean)) {
    if (stack.includes(reference.location)) throw new Error(`host requirement recipe cycle: ${reference.location}`);
    const dependency = await load(reference);
    const kind = reference === recipe.from ? "image" : "module";
    if (inspectDollyfile(dependency).kind !== kind) throw new Error(`expected ${kind}: ${reference.location}`);
    required.push(...await imageHostRequirements(dependency, load, [...stack, reference.location]));
  }
  return hostRequirements(required);
}

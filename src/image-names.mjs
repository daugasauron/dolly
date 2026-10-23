// What a recipe may name: an image, and the paths no image retains.

// Image names: [a-z][a-z0-9]*(-[a-z0-9]+|\.[0-9]+)*, at most 32 bytes. A dot
// starts a run of version digits, so a documentation copy such as
// Dollyfile-example.txt is never a recipe.
export const validName = name => /^[a-z][a-z0-9]*(?:-[a-z0-9]+|\.[0-9]+)*$/.test(name) && name.length <= 32;

// No image retains scratch space.
export function unretainedPath(value) {
  return ["/tmp", "/workspace"].some((prefix) => value === prefix || value.startsWith(`${prefix}/`));
}

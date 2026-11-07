let counter = 0;

/** Short unique id with a readable prefix, e.g. `sub-k3j9x2`. */
export function uid(prefix: string): string {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}-${rand}${counter.toString(36)}`;
}

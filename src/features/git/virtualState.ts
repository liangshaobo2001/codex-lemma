// Only viewport coordinates survive unmounts, never file contents or DOM nodes.
const offsets = new Map<string, number>();
export function readGitScroll(key: string): number | undefined {
  return offsets.get(key);
}
export function saveGitScroll(key: string, offset: number) {
  offsets.delete(key);
  offsets.set(key, offset);
  if (offsets.size > 32) offsets.delete(offsets.keys().next().value!);
}

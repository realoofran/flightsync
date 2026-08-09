// src/lib/sortAddons.js
export const SORT_OPTIONS = [
  { value: 'default', label: 'Scan order' },
  { value: 'name', label: 'Name (A-Z)' },
  { value: 'type', label: 'Type' },
  { value: 'size', label: 'Size (largest first)' },
];

/**
 * @param {Addon[]} addons
 * @param {'default'|'name'|'type'|'size'} sortBy
 * @param {Record<string, number>|null} sizes  id -> bytes, only needed for 'size'
 * @returns {Addon[]} a new array — never mutates the input
 */
export function sortAddons(addons, sortBy, sizes) {
  if (sortBy === 'name') {
    return [...addons].sort((a, b) => a.title.localeCompare(b.title));
  }
  if (sortBy === 'type') {
    return [...addons].sort((a, b) => a.contentType.localeCompare(b.contentType) || a.title.localeCompare(b.title));
  }
  // 'size' falls back to input order when sizes haven't been measured yet
  // (the Library button that computes them is opt-in) rather than silently
  // sorting as if everything were zero bytes.
  if (sortBy === 'size' && sizes) {
    return [...addons].sort((a, b) => (sizes[b.id] ?? 0) - (sizes[a.id] ?? 0));
  }
  return addons;
}

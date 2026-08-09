// src/lib/fuzzySearch.js
//
// Small, dependency-free fuzzy matcher for the command palette — exact and
// prefix matches score highest, then substring, then a subsequence fallback
// (so "eddm" still finds "EDDM - Munich" even split across words) with a
// bonus for contiguous runs so tighter matches rank above scattered ones.

export function fuzzyScore(query, text) {
  if (!query) return 0;
  if (!text) return -1;
  const q = query.toLowerCase().trim();
  const t = text.toLowerCase();
  if (!q) return 0;

  if (t === q) return 1000;
  if (t.startsWith(q)) return 500;
  const idx = t.indexOf(q);
  if (idx !== -1) return 300 - idx;

  let qi = 0;
  let score = 0;
  let lastMatch = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += lastMatch === ti - 1 ? 5 : 1;
      lastMatch = ti;
      qi++;
    }
  }
  return qi === q.length ? score : -1;
}

/**
 * @param {string} query
 * @param {T[]} items
 * @param {(item: T) => string} getText
 * @returns {T[]} items that matched, best first — returns all items
 *   unfiltered (in original order) when query is empty.
 */
export function fuzzyFilter(query, items, getText) {
  if (!query || !query.trim()) return items;
  return items
    .map((item) => ({ item, score: fuzzyScore(query, getText(item)) }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}

/** Flesch–Kincaid grade with a transparent heuristic English syllable counter.
 * This measures text features, not comprehension or clinical accuracy. */
export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return w ? 1 : 0;
  let n = (w.match(/[aeiouy]+/g) ?? []).length;
  if (/e$/.test(w) && !/[^aeiou]le$/.test(w)) n--;
  if (/es$/.test(w) && !/(?:ses|xes|zes|ches|shes)$/.test(w)) n--;
  return Math.max(1, n);
}
export function fleschKincaid(text: string): number | null {
  const words = text.match(/[a-z]+(?:'[a-z]+)?/gi) ?? [];
  if (!words.length) return null;
  // Decimal points and common e.g./i.e. abbreviations are not sentence ends.
  const sentencesText = text.replace(/(\d)\.(?=\d)/g, '$1').replace(/\b(?:e\.g\.|i\.e\.)/gi, 'eg');
  const sentences = Math.max(1, sentencesText.split(/[.!?]+(?:\s|$)/).filter(s => /[a-z]/i.test(s)).length);
  return 0.39 * words.length / sentences + 11.8 * words.reduce((sum, w) => sum + syllables(w), 0) / words.length - 15.59;
}

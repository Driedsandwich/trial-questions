export type Section = 'inclusion' | 'exclusion' | 'unspecified';
/** Offsets are UTF-16 code units, start inclusive, end exclusive (String.slice). */
export interface Criterion {
  id: string; section: Section; original: string; start: number; end: number;
  depth: number; parentId?: string;
}
export interface Heading { text: string; section: Section; start: number; end: number }
export interface SplitResult { items: Criterion[]; headings: Heading[]; warnings: string[] }

// Deliberately anchored: a sentence mentioning exclusion is not a heading.
const heading = /^\s*(?:#{1,6}\s*)?(?:\*\*|__)?(?:key\s+|main\s+|general\s+|additional\s+)?(inclusion|exclusion)(?:\s+(?:criteria|criterion|requirements?))?(?:\s+(?:for|of)\s+[^:\n]{1,100})?\s*(?:\*\*|__)?\s*(?::\s*(?:\*\*|__)?\s*|$)/i;
const bullet = /^(\s*)(?:[-*+•▪◦‣–]|\d+[.)]|\(\d+\)|[a-zA-Z][.)]|\([a-zA-Z]\)|[ivxlcdm]+[.)])\s+/;
export function splitCriteria(text: string): SplitResult {
  const items: Criterion[] = [], headings: Heading[] = [];
  let section: Section = 'unspecified';
  let pending: { start: number; end: number; indent: number; isBullet: boolean } | undefined;
  let stack: { indent: number; item: Criterion }[] = [];
  let blank = false;
  const flush = () => {
    if (!pending) return;
    let { start, end } = pending;
    while (start < end && /\s/.test(text[start]!)) start++;
    while (end > start && /\s/.test(text[end - 1]!)) end--;
    if (end > start) {
      while (stack.length && stack.at(-1)!.indent >= pending.indent) stack.pop();
      // A preceding unbulleted lead-in ending with ':' also supplies context.
      const parent = stack.at(-1)?.item;
      const item: Criterion = { id: `criterion-${items.length + 1}`, section, original: text.slice(start, end), start, end, depth: parent ? parent.depth + 1 : 0, parentId: parent?.id };
      items.push(item);
      if (pending.isBullet || /:\s*$/.test(item.original)) stack.push({ indent: pending.isBullet ? pending.indent : -1, item });
    }
    pending = undefined;
  };
  for (const line of text.matchAll(/[^\r\n]+|\r\n|\n|\r/g)) {
    const raw = line[0];
    if (/^[\r\n]+$/.test(raw)) continue;
    if (!raw.trim()) { blank = true; continue; }
    const offset = line.index!;
    // Empty lines are not emitted by the regex; inspect the gap as well.
    if (pending && /(?:\r?\n)[ \t]*(?:\r?\n)/.test(text.slice(pending.end, offset))) blank = true;
    let content = raw;
    let start = offset;
    const marker = bullet.exec(content);
    // Heading detection also accepts a bullet before a section title.
    const candidate = marker ? content.slice(marker[0].length) : content;
    const h = heading.exec(candidate);
    if (h) {
      flush(); stack = [];
      section = h[1]!.toLowerCase() as Section;
      const hStart = offset + (marker?.[0].length ?? 0);
      headings.push({ text: candidate.slice(0, h[0].length).trim(), section, start: hStart, end: hStart + h[0].length });
      content = candidate.slice(h[0].length);
      start = hStart + h[0].length;
      blank = false;
      if (content.trim()) pending = { start, end: offset + raw.length, indent: 0, isBullet: false };
      continue;
    }
    if (marker) {
      flush();
      start += marker[0].length;
      pending = { start, end: offset + raw.length, indent: marker[1]!.replace(/\t/g, '    ').length, isBullet: true };
    } else if (pending && !blank) {
      pending.end = offset + raw.length;
    } else {
      flush();
      if (!raw.match(/^\s/)) stack = [];
      pending = { start, end: offset + raw.length, indent: raw.match(/^\s*/)?.[0].length ?? 0, isBullet: false };
    }
    blank = false;
  }
  flush();
  return { items, headings, warnings: [
    ...(!headings.length && text.trim() ? ['No recognized section headings; text remains unspecified.'] : []),
    ...(!items.length ? ['No eligibility text was supplied.'] : []),
  ] };
}
export function ancestors(item: Criterion, items: Criterion[]): Criterion[] {
  const result: Criterion[] = [];
  let id = item.parentId;
  while (id) { const parent = items.find(i => i.id === id); if (!parent || result.includes(parent)) break; result.unshift(parent); id = parent.parentId; }
  return result;
}

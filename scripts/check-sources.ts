import { writeFile } from 'node:fs/promises';
import { GLOSSARY } from '../src/glossary.js';
const rows: string[] = [];
let failed = 0;
for (const entry of GLOSSARY) {
  try {
    const response = await fetch(entry.source, { signal: AbortSignal.timeout(20_000) });
    const html = await response.text();
    let title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
    if (!response.ok || /not found|access denied/i.test(title)) throw new Error(`HTTP ${response.status}: ${title}`);
    // Print the definition for human review; do not save source page copies.
    let definition = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]*)"/)?.[1]
      ?? html.match(/<div[^>]+class="[^"]*definition[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (entry.source.includes('cancer.gov/publications/dictionaries/')) {
      const slug = entry.source.split('/').at(-1)!;
      const api = await fetch('https://webapis.cancer.gov/glossary/v1/Terms/Cancer.gov/Patient/en/' + slug, { signal: AbortSignal.timeout(20_000) });
      if (!api.ok) throw new Error('Definition API HTTP ' + api.status);
      const data = await api.json() as { termName: string; definition: { text: string } };
      definition = data.definition.text;
      title = 'NCI definition: ' + data.termName;
      if (!definition) throw new Error('Missing definition');
    }
    console.log(`${entry.term}: ${definition?.slice(0, 650) ?? title}`);
    rows.push(`| ${entry.term} | ${entry.plain} | [${response.status}](${entry.source}) | ${title.replace(/\|/g, '\\|')} |`);
  } catch (error) { failed++; console.error(entry.term, String(error)); rows.push(`| ${entry.term} | ${entry.plain} | FAILED | Could not verify |`); }
}
await writeFile(new URL('../eval/SOURCES.md', import.meta.url), `# Glossary source checks\n\nChecked at ${new Date().toISOString()}. ${GLOSSARY.length} entries; ${failed} failed source checks (HTTP/title and NCI definition API). Short glosses are authored paraphrases. A reachable page does not validate all uses of a gloss; definition text was reviewed during development. The “prior” in “prior therapy” is an ordinary-language modifier; its source defines therapy. No source-page copies are retained.\n\n| Term | Gloss | Source HTTP | Page title |\n| --- | --- | --- | --- |\n${rows.join('\n')}\n`);
if (failed) process.exitCode = 1;

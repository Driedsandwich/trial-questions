import { DISCLAIMER, MODIFICATION_NOTICE, type Checklist } from './checklist.js';
import { STATUS_LABELS } from './structured.js';
const html = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const md = (s: string) => html(s).replace(/([\\`*_{}\[\]()#+.!|~-])/g, '\\$1').replace(/\r?\n/g, '<br>');
export interface Sheet { markdown: string; html: string }
export interface SheetOptions { notes?: string }
/** A single handout document, flowing to more print pages when necessary. */
export function createSheet(checklist: Checklist, options: SheetOptions = {}): Sheet {
  const c = checklist;
  const sourceUrl = `https://clinicaltrials.gov/study/${/^NCT\d{8}$/.test(c.nctId) ? c.nctId : ''}`;
  const provenance = `Processed: ${c.source.processedAt} | Retrieved: ${c.source.retrievedAt}${c.source.apiResponseDate ? ` | API response date: ${c.source.apiResponseDate}` : ''}${c.source.lastUpdatePosted ? ` | Record last updated: ${c.source.lastUpdatePosted}` : ''}`;
  const structuredMd = c.structured.map(s => `| ${md(s.original)} | ${STATUS_LABELS[s.status]} | ${md(s.reason)} |`).join('\n');
  const rows = c.items.map(i => {
    const original = [...i.context.map(p => `Context: ${p.original}`), i.original].join('\n');
    const question = i.rewrite.question ?? `Original retained (${i.rewrite.fallbackReason ?? 'review'}): ${i.rewrite.displayText}`;
    return { item: i, original, question };
  });
  const markdown = `# Questions for my doctor\n\n${md(c.nctId)} — ${md(c.title)}\n\nRecruitment status in registry: ${md(c.overallStatus)}\n\nData from ClinicalTrials.gov — ${sourceUrl}\n\n${md(provenance)}\n\n${MODIFICATION_NOTICE}\n\n${DISCLAIMER}\n\n## Structured fields (each field only)\n\n| Registry field | Comparison | Note |\n| --- | --- | --- |\n${structuredMd}\n\n## Questions and original text\n\n| Section / position | Question or retained original | Original text and parent context | Status / number check |\n| --- | --- | --- | --- |\n${rows.map(({ item: i, original, question }) => `| ${i.section} / ${i.start}–${i.end} | ${md(question)} | ${md(original)} | Ask your doctor / ${i.rewrite.numberCheck.passed ? 'passed' : 'failed'} |`).join('\n')}\n\n${c.warnings.map(w => md(w)).join('\n\n')}\n\nNotes for my doctor: ____________________\n`;
  const document = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Questions for my doctor</title>
<style>
*{box-sizing:border-box}body{font:14px/1.5 Inter,ui-sans-serif,system-ui,sans-serif;max-width:1100px;margin:28px auto;padding:0 24px;color:#233238}h1{font-size:24px;line-height:1.25;color:#0f5c5e}h2{font-size:18px;color:#0f5c5e}p{overflow-wrap:anywhere}a{color:#0f5c5e}table{width:100%;border-collapse:collapse;margin:12px 0 24px;table-layout:fixed}th,td{border:1px solid #c4d4d6;padding:10px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#e7f1f0;font-weight:600}pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere;margin:0}.notice{border-left:3px solid #0f5c5e;background:#e7f1f0;padding:12px}thead{display:table-header-group}
@media screen and (max-width:640px){body{padding:0 16px;margin:20px auto}table,tbody,tr,td{display:block;width:100%}thead{display:none}tr{border:1px solid #c4d4d6;border-radius:6px;margin:14px 0}td{border:0;border-top:1px solid #d6e0e2}td:first-child{border-top:0;background:#f0f6f5}td:nth-child(2)::before{content:'Source / comparison';display:block;font-size:12px;font-weight:600;color:#0f5c5e;margin-bottom:6px}td:nth-child(3)::before{content:'Details';display:block;font-size:12px;font-weight:600;color:#0f5c5e;margin-bottom:6px}}
@page{size:A4 landscape;margin:12mm}@media print{body{margin:0;padding:0;max-width:none;font-size:11pt;line-height:1.35}a{color:inherit;text-decoration:none}h1{font-size:18pt}h2{font-size:13pt}h1,h2{break-after:avoid}tr{break-inside:avoid}th,td{padding:6px}body>p{font-size:9pt;margin:6px 0}h1{margin:0 0 10px}h2{margin:14px 0 6px}table{margin:8px 0 14px}.notice{padding:8px}table:not(.structured-fields) td:last-child{font-size:9pt;line-height:1.25}.structured-fields{display:block;break-inside:avoid}.structured-fields thead{display:none}.structured-fields tbody{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #c4d4d6}.structured-fields tr{display:block;border-right:1px solid #c4d4d6}.structured-fields tr:last-child{border-right:0}.structured-fields td{display:block;border:0;padding:4px 8px;font-size:9pt}.structured-fields td:first-child{font-weight:600;padding-top:8px}.structured-fields td:last-child{padding-bottom:8px}}
</style></head><body>
<h1>Questions for my doctor</h1><p>${html(c.nctId)} — ${html(c.title)}</p><p>Recruitment status in registry: ${html(c.overallStatus)}</p>
<p>Data from ClinicalTrials.gov — <a href="${sourceUrl}">${sourceUrl}</a></p><p>${html(provenance)}</p>
<p>${MODIFICATION_NOTICE}</p><p class="notice">${DISCLAIMER}</p>
<h2>Questions and original text</h2><table><thead><tr><th>Question or retained original</th><th>Original text and parent context</th><th style="width:16%">Section / status / number check</th></tr></thead><tbody>${rows.map(({ item: i, original, question }) => `<tr><td><pre>${html(question)}</pre></td><td><pre>${html(original)}</pre></td><td>${i.section}<br>Position ${i.start}–${i.end}<br>Ask your doctor<br>Number check: ${i.rewrite.numberCheck.passed ? 'passed' : 'failed'}</td></tr>`).join('')}</tbody></table>
<h2>Structured fields (each field only)</h2><table class="structured-fields"><thead><tr><th>Registry field</th><th>Comparison</th><th>Note</th></tr></thead><tbody>${c.structured.map(s => `<tr><td>${html(s.original)}</td><td>${STATUS_LABELS[s.status]}</td><td>${html(s.reason)}</td></tr>`).join('')}</tbody></table>
${c.warnings.map(w => `<p>${html(w)}</p>`).join('')}<p>Notes for my doctor: ____________________</p></body></html>`;
  return {
    markdown: options.notes ? markdown.replace('Notes for my doctor: ____________________', () => `Notes for my doctor: ${md(options.notes!)}`) : markdown,
    html: options.notes ? document.replace('<p>Notes for my doctor: ____________________</p>', () => `<h2>Notes for my doctor</h2><pre>${html(options.notes!)}</pre>`) : document,
  };
}

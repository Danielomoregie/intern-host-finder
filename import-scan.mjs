import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { changeData, defaultDataPath, postIdentity } from './store.mjs';
import { partitionByEmployer } from './host-criteria.mjs';
export async function importScan(update, dataPath = defaultDataPath) {
if (!update.scan?.at || !update.scan?.coverage || !Array.isArray(update.leads)) throw new Error('A scan needs a timestamp, coverage and leads array.');
for (const l of update.leads) if (!l.url?.startsWith('https://www.linkedin.com/') || !l.person || !l.status || !l.checkedAt) throw new Error('Invalid lead evidence.');
return changeData(dataPath, data => {
  data.rejectionHistory ??= []; data.scans ??= [];
  const records = [...data.leads, ...data.rejectionHistory];
  for (const incoming of update.leads) {
    const existing = records.find(l => postIdentity(l.url) === postIdentity(incoming.url));
    if (existing) { const { outreach, userNotes } = existing; Object.assign(existing, incoming, { outreach, userNotes }); }
    else records.push({ ...incoming, outreach: 'Not contacted', userNotes: '' });
  }
  Object.assign(data, partitionByEmployer(records));
  if (!data.scans.some(s => s.at === update.scan.at && s.result === update.scan.result)) data.scans.push(update.scan);
  return { tracked: data.leads.length, scans: data.scans.length };
});
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = process.argv.indexOf('--scan');
  if (arg < 0 || !process.argv[arg + 1]) throw new Error('Provide --scan followed by an evidence-based scan JSON file.');
  const update = JSON.parse(await fs.readFile(process.argv[arg + 1], 'utf8'));
  console.log(JSON.stringify(await importScan(update)));
}

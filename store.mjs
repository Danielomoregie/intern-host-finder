import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { isQualifyingHost, postIdentity, isGoogleEmployeeForDisplay } from './host-criteria.mjs';
export { isQualifyingHost, postIdentity };
const root = fileURLToPath(new URL('./', import.meta.url));
let localConfig = {};
try { localConfig = JSON.parse(readFileSync(path.join(root, '.local-config.json'), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const starterDataPath = path.join(root, 'data', 'leads.json');
export const defaultDataPath = process.env.TRACKER_DATA_PATH || localConfig.dataPath || starterDataPath;
export const statuses = ['Not contacted', 'Contacted', 'Replied', 'Not a fit', 'Matched'];
export const load = async (dataPath = defaultDataPath) => {
  try { return JSON.parse(await fs.readFile(dataPath, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT' || dataPath !== starterDataPath) throw error;
    await fs.mkdir(path.dirname(dataPath), { recursive: true });
    try { await fs.writeFile(dataPath, await fs.readFile(path.join(root, 'data.example.json')), { flag: 'wx' }); }
    catch (writeError) { if (writeError.code !== 'EEXIST') throw writeError; }
    return JSON.parse(await fs.readFile(dataPath, 'utf8'));
  }
};
export async function changeData(dataPath, mutate) {
  // The website and scan importer share a lock and atomic write, so notes survive refreshes.
  if (dataPath === starterDataPath) await load(dataPath);
  const lockPath = dataPath + '.website.lock';
  let lock;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { lock = await fs.open(lockPath, 'wx'); break; }
    catch (e) { if (e.code !== 'EEXIST') throw e; await delay(50); }
  }
  if (!lock) throw new Error('The tracker is updating. Please try again in a moment.');
  const temp = `${dataPath}.${process.pid}.pending`;
  try {
    const data = await load(dataPath);
    const result = await mutate(data);
    await fs.writeFile(temp, JSON.stringify(data, null, 2) + '\n');
    await fs.rename(temp, dataPath);
    return result;
  } finally { await fs.rm(temp, { force: true }); await lock.close(); await fs.unlink(lockPath); }
}
export function present(data, now = new Date()) {
  const seen = new Set();
  const leads = data.leads.filter(l => {
    if (!isGoogleEmployeeForDisplay(l)) return false;
    const id = postIdentity(l.url);
    if (seen.has(id)) return false;
    seen.add(id); return true;
  }).map(l => {
    const actionable = isQualifyingHost(l, now);
    const observed = l.publishedAt ? new Date(l.publishedAt) : Number.isFinite(l.ageDaysWhenObserved) && l.ageObservedAt ? new Date(new Date(l.ageObservedAt).getTime() - l.ageDaysWhenObserved * 86400000) : null;
    const age = observed ? (now - observed) / 86400000 : null;
    const state = actionable ? 'open' : /closed/i.test(l.status) ? 'closed' : /outside.*US|non-US/i.test(l.status) ? 'outside' : /^excluded/i.test(l.status) ? 'excluded' : 'unconfirmed';
    return { ...l, id: postIdentity(l.url), actionable, state, ageDays: age !== null && age >= 0 ? Math.floor(age) : null, ageEstimated: !l.publishedAt, freshness: age === null || age < 0 ? 'Age unconfirmed' : age >= 7 ? 'Older than 7 days' : 'Within 7 days by saved age' };
  }).sort((a,b) => Number(b.actionable) - Number(a.actionable) || new Date(b.checkedAt ?? 0) - new Date(a.checkedAt ?? 0));
  const scans = [...(data.scans ?? [])].sort((a,b) => new Date(b.at) - new Date(a.at));
  return { leads, scans, lastSearch: scans.find(s => s.kind !== 'scope-correction') ?? null, now: now.toISOString() };
}
export async function saveNotes(dataPath, id, edits) {
  if (!edits || typeof edits !== 'object' || typeof edits.userNotes !== 'string' || edits.userNotes.length > 20000 || !statuses.includes(edits.outreach)) throw Object.assign(new Error('Choose a valid outreach status and keep notes below 20,000 characters.'), { status: 400 });
  return changeData(dataPath, data => {
    const lead = [...data.leads, ...(data.rejectionHistory ?? [])].find(l => postIdentity(l.url) === id);
    if (!lead) throw Object.assign(new Error('This post was not found.'), { status: 404 });
    lead.outreach = edits.outreach; lead.userNotes = edits.userNotes;
    return { outreach: lead.outreach, userNotes: lead.userNotes };
  });
}

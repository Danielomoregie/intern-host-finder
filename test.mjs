import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { load, saveNotes, postIdentity, present } from './store.mjs';
import { importScan } from './import-scan.mjs';
import { createServer } from './server.mjs';
const seed = { leads: [
 {person:'Example US host', employer:'Google',employerEvidence:'Synthetic Google author headline',employerEvidenceSource:'Test fixture',url:'https://www.linkedin.com/posts/example-share-7000000000000000001-test/',status:'Closed - submissions no longer accepted',checkedAt:'2026-10-21T12:00:00Z',hostCountry:'US',projectCountry:'US',outreach:'Not contacted',userNotes:'',screenshotEvidence:{notes:'Synthetic historical screenshot'}},
 {person:'Example EMEA host',employer:'Google',employerEvidence:'Synthetic Google author headline',employerEvidenceSource:'Test fixture',url:'https://www.linkedin.com/posts/example-share-7000000000000000002-test/',status:'Outside US scope - EMEA',checkedAt:'2026-10-20T12:00:00Z',outreach:'Not contacted',userNotes:''}
],scans:[],rejectionHistory:[{person:'Example non-Google author',employer:'Example Co',url:'https://www.linkedin.com/posts/example-share-7000000000000000003-test/'}]};
async function fixture(t) {
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'matchboard-test-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'leads.json');await fs.writeFile(file,JSON.stringify(seed));return file;
}
test('notes and a concurrent scan merge preserve source evidence and canonical identity',async t=>{
 const file=await fixture(t), before=await load(file), lead=before.leads[0], id=postIdentity(lead.url);
 await saveNotes(file,id,{outreach:'Replied',userNotes:'A locally saved user note.'});
 const incoming={...lead,url:`https://www.linkedin.com/feed/update/urn:li:activity:${id.split(':').at(-1)}/`,outreach:'Not contacted',userNotes:'Must not overwrite user edits'};
 const update={leads:[incoming],scan:{at:'2026-10-22T04:00:00Z',result:'Fixture only',coverage:'Local test',newLeads:0,updatedLeads:0}};
 await Promise.all([importScan(update,file),saveNotes(file,id,{outreach:'Replied',userNotes:'User note survives the scan.'})]);
 const after=await load(file), saved=after.leads.find(l=>postIdentity(l.url)===id);
 assert.equal(saved.outreach,'Replied');assert.equal(saved.userNotes,'User note survives the scan.');
 assert.equal(saved.checkedAt,lead.checkedAt);assert.deepEqual(saved.screenshotEvidence,lead.screenshotEvidence);
 assert.deepEqual(after.rejectionHistory,before.rejectionHistory);assert.equal(after.leads.length,before.leads.length);
 assert.equal(after.scans.length,before.scans.length+1);
 await importScan(update,file);assert.equal((await load(file)).scans.length,after.scans.length);
});
test('the website keeps closed and outside-US Google history visible and non-actionable',async()=>{
 const data=structuredClone(seed);const view=present(data,new Date('2026-10-22T04:00:00Z'));
 assert.equal(view.leads.find(l=>l.person==='Example US host').state,'closed');
 assert.equal(view.leads.find(l=>l.person==='Example EMEA host').state,'outside');
 assert.equal(view.leads.filter(l=>l.actionable).length,0);
 assert(view.leads.every(l=>l.employer==='Google'));assert.equal(view.scans.length,data.scans.length);
});
test('local HTTP API saves notes, rejects invalid writes and serves the website',async t=>{
 const dataPath=await fixture(t), before=await load(dataPath), server=createServer({dataPath});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base=`http://127.0.0.1:${server.address().port}`, id=postIdentity(before.leads[0].url), route=`${base}/api/leads/${encodeURIComponent(id)}`;
 assert.equal((await fetch(base)).status,200);assert.equal((await fetch(base+'/api/data')).status,200);
 const opts={method:'PATCH',headers:{'content-type':'application/json',origin:base},body:JSON.stringify({outreach:'Contacted',userNotes:'HTTP fixture note'})};
 assert.equal((await fetch(route,opts)).status,200);
 assert.equal((await load(dataPath)).leads[0].userNotes,'HTTP fixture note');
 assert.equal((await fetch(route,{...opts,headers:{...opts.headers,origin:'https://example.com'}})).status,403);
 assert.equal((await fetch(route,{...opts,body:JSON.stringify({outreach:'Bogus',userNotes:'x'})})).status,400);
 assert.equal((await fetch(route,{...opts,body:'null'})).status,400);
 assert.equal((await fetch(base+'/not-a-file')).status,404);
 const after=await load(dataPath);assert.equal(after.leads[0].checkedAt,before.leads[0].checkedAt);assert.deepEqual(after.scans,before.scans);
});

test('scan cadence is every 30 minutes immediately and stays consistent across DST',async()=>{
 const {scanTiming,CADENCE_START}=await import('./public/schedule.js');
 assert.equal(scanTiming({at:'2026-10-25T00:16:21Z'}).intervalMinutes,30);
 assert.equal(scanTiming({at:'2026-10-25T00:16:21Z'}).nextAt,CADENCE_START+1800000);
 assert.equal(scanTiming({at:'2026-10-25T04:10:00Z',scheduledFor:'2026-10-25T04:00:00Z'}).nextAt,Date.parse('2026-10-25T04:30:00Z'));
 assert.equal(scanTiming({at:'2026-11-01T06:30:00Z'}).nextAt,Date.parse('2026-11-01T07:00:00Z'));
 assert.deepEqual(scanTiming(null),{intervalMinutes:30,nextAt:null});
 assert.deepEqual(scanTiming({at:'invalid'}),{intervalMinutes:30,nextAt:null});
});

test('macOS service can initialize without opening protected project startup paths',async()=>{
 const {servicePlist}=await import('./macos-service.mjs');
 const plist=servicePlist('/Users/example/Documents/Tracker','/usr/local/bin/node','/Users/example/Library/Logs/Tracker & Notes');
 assert(!plist.includes('<key>WorkingDirectory</key>'));
 assert(plist.includes('/Users/example/Documents/Tracker/server.mjs'));
 assert(plist.includes('/Users/example/Library/Logs/Tracker &amp; Notes/server.log'));
 assert(plist.includes('/Users/example/Library/Logs/Tracker &amp; Notes/server-error.log'));
 assert(plist.includes('<key>KeepAlive</key><true/>'));
});

test('a failed initial load reports disconnection and recovers without claiming the schedule is gone',async()=>{
 const vm=await import('node:vm');
 const {scanTiming}=await import('./public/schedule.js');
 const elements=new Map();
 const element=selector=>{
  if(!elements.has(selector))elements.set(selector,{textContent:'',innerHTML:'',value:selector==='#filter'?'all':'',classList:{toggle(){},add(){},remove(){}}});
  return elements.get(selector);
 };
 let response;
 const context=vm.createContext({scanTiming,console,Date,setTimeout:()=>0,clearTimeout(){},setInterval(){},location:{hash:'#leads'},window:{addEventListener(){}},document:{querySelector:element,querySelectorAll:()=>[],addEventListener(){}},fetch:async()=>{if(!response)throw new Error('Server offline');return {ok:true,json:async()=>structuredClone(response)};}});
 const source=(await fs.readFile(new URL('./public/app.js',import.meta.url),'utf8')).replace("import { scanTiming } from '/schedule.js';",'');
 vm.runInContext(source,context);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(element('#countdown').textContent,'Disconnected');
 assert.equal(element('#last-search').textContent,'Unavailable');
 assert.equal(element('#total-count').textContent,'—');
 assert.match(element('#timer-caption').textContent,/retrying automatically/);
 response={leads:[],scans:[{at:'2026-10-26T21:18:00Z',result:'Synthetic saved scan'}],lastSearch:{at:'2026-10-26T21:18:00Z'}};
 await vm.runInContext('refresh()',context);
 assert.equal(element('#total-count').textContent,0);
 assert.equal(element('#scan-count').textContent,1);
 assert.notEqual(element('#countdown').textContent,'Disconnected');
 assert.match(element('#scan-summary').textContent,/0 tracked posts/);
 const previousScan=element('#last-search').textContent;
 response=null;
 await vm.runInContext('refresh()',context);
 assert.equal(element('#countdown').textContent,'Disconnected');
 assert.equal(element('#scan-count').textContent,1);
 assert.equal(element('#last-search').textContent,previousScan);
 response={leads:[],scans:[],lastSearch:null};
 await vm.runInContext('refresh()',context);
 assert.equal(element('#countdown').textContent,'No scan history');
});

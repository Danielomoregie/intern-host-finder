import { scanTiming } from '/schedule.js';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statuses = ['Not contacted','Contacted','Replied','Not a fit','Matched'];
let data = { leads: [], scans: [] }, activeId = null, lastFocus, toastTimer, loading = false, connection = 'loading';
const time = (date, detailed = false) => date ? new Date(date).toLocaleString('en-US', { timeZone:'America/Chicago', month:'short', day:'numeric', ...(detailed ? {year:'numeric'} : {}), hour:'numeric', minute:'2-digit' }) : 'Not verified';
const day = date => date ? new Date(date).toLocaleDateString('en-US', {timeZone:'America/Chicago', month:'short',day:'numeric'}) : 'Unconfirmed';
const statusName = lead => ({open:'Open',closed:'Closed',outside:'Outside US scope',excluded:'Excluded',unconfirmed:'Needs verification'}[lead.state]);
const age = lead => lead.ageDays === null ? 'Age unconfirmed' : `${lead.ageEstimated ? '~' : ''}${lead.ageDays}d old${lead.ageDays >= 7 ? ' · stale' : ''}`;
const safePost = value => /^https:\/\/www\.linkedin\.com\//.test(value || '') ? value : '#';
const field = (label, value) => value ? `<div class="detail-field"><h3>${esc(label)}</h3><p>${esc(value)}</p></div>` : '';
const options = selected => [...(statuses.includes(selected) ? [] : ['']),...statuses].map(s => `<option value="${esc(s)}" ${s===selected?'selected':''}>${esc(s || 'Choose status')}</option>`).join('');
function toast(message, error = false) { clearTimeout(toastTimer); $('#toast').textContent=message; $('#toast').classList.toggle('error',error); $('#toast').hidden=false; toastTimer=setTimeout(()=>$('#toast').hidden=true,5000); }
function showView() {
 const history = location.hash === '#history';
 $('#leads-view').hidden=history; $('#history-view').hidden=!history;
}
function updateCountdown() {
 const last=data.lastSearch;
 $('#countdown').classList.toggle('bad',connection==='error');
 if(connection!=='ready'){
  $('#countdown').textContent=connection==='error'?'Disconnected':'Loading…';
  $('#timer-caption').textContent=connection==='error'?'Cannot reach the local tracker · retrying automatically':'Reading saved scan history';return;
 }
 const timing=scanTiming(last);
 if(!last){$('#countdown').textContent='No scan history';$('#timer-caption').textContent='No saved check to estimate the next scan';return;}
 const next=timing.nextAt;
 const remaining=Math.max(0,Math.ceil((next-Date.now())/1000));
 if(!remaining){$('#countdown').textContent='Due now';$('#countdown').classList.add('bad');$('#timer-caption').textContent='Waiting for the next Cody check';return;}
 $('#countdown').classList.remove('bad');
 const hours=Math.floor(remaining/3600), minutes=Math.floor(remaining%3600/60), seconds=remaining%60;
 $('#countdown').textContent=[hours,minutes,seconds].map(n=>String(n).padStart(2,'0')).join(':');
 $('#timer-caption').textContent=`Estimated · about every ${timing.intervalMinutes} minutes`;
}
function renderSummary() {
 const open=data.leads.filter(l=>l.actionable).length;
 $('#total-count').textContent=data.leads.length;
 $('#scan-count').textContent=data.scans.length;
 $('#last-search').textContent=data.lastSearch?`${time(data.lastSearch.at)} CT`:'No scans yet';
 $('#scan-summary').textContent=connection==='error'?'Connection lost · saved records have not been deleted':`${open} verified open US hosts · ${data.leads.length} tracked posts`;
 if(connection==='error'&&!data.lastSearch){$('#total-count').textContent='—';$('#last-search').textContent='Unavailable';}
 updateCountdown();
}
function renderLeads() {
 const query=$('#search').value.trim().toLowerCase();
 const selected=$('#filter').value;
 const leads=data.leads.filter(l=>(selected==='all'||selected==='open'&&l.actionable||selected==='history'&&!l.actionable)&&[l.person,l.teamProject,l.googleRole,l.location,l.status,l.userNotes].join(' ').toLowerCase().includes(query));
 $('#shown-count').textContent=`${leads.length} of ${data.leads.length} posts · Times Central`;
 if (!leads.length) {
   $('#lead-list').innerHTML=`<tr><td colspan="7" class="empty"><strong>${selected==='open'&&!query?'No open US hosts verified yet.':'No matching posts.'}</strong>${selected==='open'&&!query?'The next check will look for new opportunities.':'Try a different search or filter.'}<br><button class="button" id="reset-view">Show all tracked posts</button></td></tr>`;
   $('#reset-view').onclick=()=>{$('#filter').value='all';$('#search').value='';renderLeads();};return;
 }
 $('#lead-list').innerHTML=leads.map(l=>`<tr>
  <td><button class="host-name" data-detail="${esc(l.id)}">${esc(l.person)}</button><span class="subtext">${esc(l.googleRole || 'Google employee')}</span></td>
  <td class="project">${esc(l.teamProject || l.internship)}</td>
  <td class="location">${esc(l.hostCountry==='US'&&l.projectCountry==='US'?l.location:/Zurich|EMEA/i.test(l.location||'')?'Zurich / EMEA':l.location||'Unconfirmed')}${l.hostCountry==='US'&&l.projectCountry==='US'?'':'<span class="subtext bad">US unconfirmed</span>'}</td>
  <td><span class="badge ${esc(l.state)}">${esc(l.state==='closed'?'Closed':statusName(l))}</span><span class="subtext ${l.ageDays===null||l.ageDays>=7?'bad':''}">${esc(age(l))}<br>Checked ${esc(day(l.checkedAt))}</span></td>
  <td><select class="row-outreach ${l.outreach==='Matched'?'positive':''}" data-outreach="${esc(l.id)}" aria-label="Outreach status for ${esc(l.person)}">${options(l.outreach)}</select></td>
  <td><button class="note-button" data-detail="${esc(l.id)}">${esc(l.userNotes || 'Add note')}</button></td>
  <td><a class="post-link" href="${esc(safePost(l.url))}" target="_blank" rel="noopener noreferrer" aria-label="Open ${esc(l.person)}’s LinkedIn post">↗</a></td>
 </tr>`).join('');
 for(const b of document.querySelectorAll('[data-detail]')) b.onclick=()=>openDrawer(b.dataset.detail);
 for(const select of document.querySelectorAll('[data-outreach]')) select.onchange=async()=>{
   const lead=data.leads.find(l=>l.id===select.dataset.outreach), previous=lead.outreach; select.disabled=true;
   try { await persist(lead.id,select.value,lead.userNotes || ''); toast('Outreach status saved.'); }
   catch(e){select.value=previous;toast(e.message,true);} finally {select.disabled=false;select.classList.toggle('positive',lead.outreach==='Matched');}
 };
}
function renderScans() {
 $('#scan-list').innerHTML=data.scans.length?data.scans.map(s=>`<details class="scan"><summary><time datetime="${esc(s.at)}">${esc(time(s.at,true))} CT</time><span class="scan-title">${esc(s.result)}</span><span class="scan-meta-count">${esc(s.newLeads??0)} new · ${esc(s.updatedLeads??0)} updated</span><span class="scan-arrow" aria-hidden="true">›</span></summary><div class="scan-body">${field('Coverage / access',s.coverage)}${field('Queries used',typeof s.queries==='string'?s.queries:JSON.stringify(s.queries,null,2))}${field('Notes / limitations',s.notes)}${field('Record type',s.kind)}${field('Scheduled check',s.scheduledFor?time(s.scheduledFor,true)+' CT':null)}</div></details>`).join(''):'<div class="empty">No searches recorded yet.</div>';
}
function humanRecord(object) {return Object.entries(object||{}).map(([key,value])=>`${key.replace(/([a-z])([A-Z])/g,'$1 $2')}: ${typeof value==='object'?JSON.stringify(value,null,2):value}`).join('\n');}
function openDrawer(id) {
 const lead=data.leads.find(l=>l.id===id);if(!lead)return;
 lastFocus=document.activeElement;activeId=id;
 const callout=lead.actionable?'Open invitation verified. Review the project and matching route before reaching out.':lead.state==='closed'?'This invitation is closed. Historical contact instructions below are retained as evidence; they are not a recommendation to contact this host.':lead.state==='outside'?'Saved as history. This post does not establish a US-based host and US project. No actionable US matching route is verified.':'Not currently actionable. Review the missing eligibility, freshness or contact evidence below.';
 $('#drawer').innerHTML=`<div class="drawer-top"><span>POST DETAILS</span><button class="close" id="close-drawer" aria-label="Close host details">×</button></div><h2 id="drawer-title">${esc(lead.person)}</h2><p class="drawer-role">${esc(lead.googleRole || 'Google employee')}</p><div class="drawer-status"><span class="badge ${esc(lead.state)}">${esc(statusName(lead))}</span><span>Checked ${esc(day(lead.checkedAt))}</span></div><div class="project-title">${esc(lead.teamProject || lead.internship)}</div><a class="drawer-post" href="${esc(safePost(lead.url))}" target="_blank" rel="noopener noreferrer">Original LinkedIn post ↗</a><div class="drawer-callout ${lead.actionable?'':'bad'}">${esc(callout)}</div>
 <form id="note-form" class="note-editor"><h3>Your notes</h3><p>Saved locally and preserved when Cody updates the tracker.</p><label for="drawer-outreach">Outreach</label><select id="drawer-outreach" class="${lead.outreach==='Matched'?'positive':''}">${options(lead.outreach)}</select><label for="drawer-notes">Notes</label><textarea id="drawer-notes" placeholder="Add a note…" maxlength="20000">${esc(lead.userNotes)}</textarea><div class="save-row"><button class="button primary" type="submit" id="save-note">Save changes</button><span id="save-status" class="save-status" role="status">${lead.userNotes?'Saved':''}</span></div></form>
 <details class="evidence-section"><summary>Source & eligibility details</summary>${field('Location',lead.location)}${field('US location evidence',lead.locationEvidence)}${field('Cycle / degree eligibility',lead.eligibility)}${field('SWE matching pool',lead.sweMatchingPoolExplicitlyAccepted&&lead.sweMatchingPoolEvidence?lead.sweMatchingPoolEvidence:'Unconfirmed')}${field('Availability / closure',lead.closureEvidence)}${field(lead.state==='closed'?'Historical contact route':'Contact route',lead.directContact||'No direct matching route established')}${field('Contact evidence',lead.directContactEvidence)}${field(lead.originalPostVerified?'Last original verification':'Evidence reviewed',lead.checkedAt?time(lead.checkedAt,true)+' CT':'Not verified')}${field('Observed age',lead.postAge)}${field('Exact publication date',lead.publishedAt?time(lead.publishedAt,true)+' CT':'Unknown; not inferred from relative age')}${field('Freshness',lead.freshness)}${field('Employer evidence',lead.employerEvidence)}${field('Employer source',lead.employerEvidenceSource)}${field('Affiliation evidence',lead.googleAffiliationEvidence)}${field('Project evidence',lead.teamProjectEvidence)}${field('Software project evidence',lead.softwareInternshipEvidence)}${field('Pipeline evidence',lead.internshipPipelineEvidence)}${field('Location scope',lead.locationScopeReason)}${field('Disqualification reason',lead.exclusionReason)}${field('Verification source',lead.evidenceSource)}${field('Source notes',lead.notes)}</details>
 <details class="evidence-section"><summary>Verification history</summary>${lead.evidenceReviewedAt?field('Screenshot reviewed',time(lead.evidenceReviewedAt,true)+' CT'):''}${lead.screenshotEvidence?field('Original screenshot',humanRecord(lead.screenshotEvidence)):''}${(lead.verificationHistory||[]).map(h=>`<div class="provenance-entry"><time>${esc(time(h.checkedAt,true))} CT</time><p>${esc(humanRecord(h))}</p></div>`).join('')}${!lead.screenshotEvidence&&!lead.verificationHistory?.length?field('Recorded verification',lead.evidenceSource):''}</details>`;
 $('#drawer-backdrop').hidden=false;$('#drawer').hidden=false;document.body.style.overflow='hidden';
 $('main').inert=true;
 $('#close-drawer').onclick=closeDrawer;
 $('#drawer').scrollTop=0;$('#close-drawer').focus();
 $('#note-form').oninput=()=>{$('#save-status').textContent='Unsaved changes';$('#drawer-outreach').classList.toggle('positive',$('#drawer-outreach').value==='Matched');};
 $('#note-form').onsubmit=async event=>{
   event.preventDefault();const button=$('#save-note');button.disabled=true;$('#save-status').textContent='Saving…';
   try{await persist(lead.id,$('#drawer-outreach').value,$('#drawer-notes').value);$('#save-status').textContent='Saved on this computer';toast('Your changes are saved.');renderLeads();}
   catch(e){$('#save-status').textContent='Could not save. Your draft is still here.';toast(e.message,true);}finally{button.disabled=false;}
 };
}
function closeDrawer(){activeId=null;$('#drawer').hidden=true;$('#drawer-backdrop').hidden=true;document.body.style.overflow='';$('main').inert=false;if(lastFocus?.isConnected)lastFocus.focus();else $('#search').focus();}
async function persist(id,outreach,userNotes){const r=await fetch(`/api/leads/${encodeURIComponent(id)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({outreach,userNotes})});const saved=await r.json();if(!r.ok)throw new Error(saved.error||'Could not save your changes.');Object.assign(data.leads.find(l=>l.id===id),saved);}
async function refresh(manual=false){
 if(loading)return;loading=true;$('#refresh').disabled=true;
 try{const r=await fetch('/api/data',{cache:'no-store'});if(!r.ok)throw new Error('Could not read the local tracker.');data=await r.json();connection='ready';renderSummary();renderLeads();renderScans();if(manual)toast('Showing the latest saved records.');}
 catch(e){connection='error';renderSummary();toast('Could not load the tracker. Check that the local server is running.',true);if(!data.leads.length)$('#lead-list').innerHTML='<tr><td colspan="7" class="empty">Could not load the tracker. Use Reload to try again.</td></tr>';}
 finally{loading=false;$('#refresh').disabled=false;}
}
$('#search').oninput=renderLeads;$('#filter').onchange=renderLeads;
$('#refresh').onclick=()=>refresh(true);$('#drawer-backdrop').onclick=closeDrawer;
window.addEventListener('hashchange',showView);
document.addEventListener('keydown',e=>{if(!activeId)return;if(e.key==='Escape')closeDrawer();if(e.key==='Tab'){const focusable=[...$('#drawer').querySelectorAll('button,a,select,textarea,summary')].filter(el=>el.getClientRects().length&&!el.disabled);const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
showView();refresh();setInterval(updateCountdown,1000);
setInterval(()=>{if(!document.hidden&&!activeId&&document.activeElement?.tagName!=='SELECT')refresh();},30000);

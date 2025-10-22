// ----- PWA install prompt -----
let deferredPrompt;
const installBtn = document.getElementById('installBtn');
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.hidden = false;
});
installBtn?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.hidden = true;
});

// ----- Service worker -----
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js');
  });
}

// ----- Helpers -----
const $ = (sel) => document.querySelector(sel);
const entriesEl = $('#entries');
const searchEl = $('#search');
const sortEl = $('#sortBy');
const mainEl = $('#appMain');
const footerEl = $('#appFooter');

function uid(){ return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) }
function saveDB(db){ localStorage.setItem('aj_db_v1', JSON.stringify(db)); }
function loadDB(){ try { return JSON.parse(localStorage.getItem('aj_db_v1')) ?? {entries: []}; } catch { return {entries: []}; } }

// ----- Simple SHA-256 hashing for PIN -----
async function sha256(text){
  const enc = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
}
const PIN_KEY = 'aj_pin_hash_v1';
const PIN_STATE = { stage: 'unset', buffer: '', firstHash: '' };

function pinDotsUpdate(){
  const dots = document.querySelectorAll('.pin-dots span');
  dots.forEach((d,i)=> d.classList.toggle('filled', i < PIN_STATE.buffer.length));
}
function clearBuffer(){ PIN_STATE.buffer=''; pinDotsUpdate(); $('#lockError').textContent=''; $('#lockAction').disabled=true; }

async function hasPin(){ return !!localStorage.getItem(PIN_KEY); }
async function setPin(pin){ localStorage.setItem(PIN_KEY, await sha256(pin)); }
async function verifyPin(pin){ const stored = localStorage.getItem(PIN_KEY); if(!stored) return false; return stored === await sha256(pin); }

async function showLock(){
  const locked = $('#lockScreen');
  const has = await hasPin();
  PIN_STATE.stage = has ? 'unlock' : 'set1';
  clearBuffer();
  $('#lockTitle').textContent = has ? 'Enter PIN' : 'Set your PIN';
  $('#lockSubtitle').textContent = has ? 'Unlock your journal' : 'Create a 4‑digit PIN to protect your journal.';
  $('#lockAction').textContent = has ? 'Unlock' : 'Continue';
  locked.style.display = 'flex';
  mainEl.hidden = true; footerEl.hidden = true;
}
async function hideLock(){
  $('#lockScreen').style.display = 'none';
  mainEl.hidden = false; footerEl.hidden = false;
}

function expectedCost(scenarios){
  return scenarios.reduce((acc, s) => acc + (Number(s.prob||0)/100) * (s.plan?.trim()?0.5:1), 0);
}

function renderEntries(){
  const q = (searchEl.value || '').toLowerCase();
  const sort = sortEl.value;
  let list = loadDB().entries;
  if(q){ list = list.filter(e => (e.title+e.anxiety+e.reflection+e.reset).toLowerCase().includes(q)); }
  if(sort === 'newest') list = list.sort((a,b)=> new Date(b.date)-new Date(a.date));
  if(sort === 'oldest') list = list.sort((a,b)=> new Date(a.date)-new Date(b.date));
  if(sort === 'prob-desc') list = list.sort((a,b)=> (expectedCost(b.scenarios) - expectedCost(a.scenarios)) );

  entriesEl.innerHTML = '';
  list.forEach(e => {
    const li = document.createElement('li');
    li.className = 'entry';
    li.innerHTML = `
      <h3>${e.title || 'Untitled'}</h3>
      <div class="meta">
        <span class="badge">${e.date}</span>
        <span class="badge">Scenarios: ${e.scenarios.length}</span>
        <span class="badge">Expected cost: ${expectedCost(e.scenarios).toFixed(2)}</span>
      </div>
      <p><strong>Anxiety:</strong> ${e.anxiety || ''}</p>
      ${e.scenarios.map((s,i)=>`
        <div class="scenario">
          <div class="row">
            <div><strong>Scenario ${i+1}:</strong> ${s.text || ''}</div>
            <div><strong>Prob:</strong> ${s.prob||0}%</div>
          </div>
          ${s.plan? `<div><strong>Plan:</strong> ${s.plan}</div>`:''}
        </div>
      `).join('')}
      ${e.benefits?.length? `<p><strong>Benefits:</strong> ${e.benefits.map(b=>b.text).join(' • ')}</p>`:''}
      ${(e.evidenceFor||e.evidenceAgainst) ? `<p><strong>Evidence</strong> — For: ${e.evidenceFor||''} | Against: ${e.evidenceAgainst||''}</p>`:''}
      ${e.tinyAction? `<p><strong>Tiny action:</strong> ${e.tinyAction} ${e.tinyWhen? ` @ ${new Date(e.tinyWhen).toLocaleString()}`:''}</p>`:''}
      ${e.reset? `<p><strong>Reset:</strong> ${e.reset}</p>`:''}
      ${e.reflection? `<p><strong>Reflection:</strong> ${e.reflection}</p>`:''}
      <div class="actions">
        <button class="btn ghost" data-edit="${e.id}">Edit</button>
        <button class="btn" data-delete="${e.id}">Delete</button>
      </div>
    `;
    entriesEl.appendChild(li);
  });
}

function addScenarioRow(text='', prob=0, plan=''){
  const container = document.getElementById('scenarios');
  const wrap = document.createElement('div');
  wrap.className = 'scenario';
  wrap.innerHTML = `
    <div class="row">
      <label>Scenario
        <input type="text" class="scenario-text" placeholder="Describe a plausible outcome..." value="${text}"/>
      </label>
      <label>Probability (%)
        <input type="number" class="scenario-prob" min="0" max="100" value="${prob}" />
      </label>
    </div>
    <label>Plan / Strategy
      <input type="text" class="scenario-plan" placeholder="What will you do if this happens?" value="${plan}"/>
    </label>
    <button type="button" class="btn small ghost remove-scenario">Remove</button>
  `;
  container.appendChild(wrap);
  wrap.querySelector('.remove-scenario').addEventListener('click', ()=> wrap.remove());
}

function addBenefitRow(text=''){
  const container = document.getElementById('benefits');
  const row = document.createElement('div');
  row.className = 'benefit';
  row.innerHTML = `
    <input type="text" class="benefit-text" placeholder="Upside, learning, meaning..." value="${text}"/>
    <button type="button" class="btn small ghost remove-benefit">✕</button>
  `;
  container.appendChild(row);
  row.querySelector('.remove-benefit').addEventListener('click', ()=> row.remove());
}

function populateForm(entry){
  document.getElementById('date').value = entry.date || new Date().toISOString().slice(0,10);
  document.getElementById('title').value = entry.title || '';
  document.getElementById('anxiety').value = entry.anxiety || '';
  document.getElementById('scenarios').innerHTML = '';
  (entry.scenarios || []).forEach(s => addScenarioRow(s.text, s.prob, s.plan));
  if((entry.scenarios || []).length === 0) addScenarioRow();
  document.getElementById('benefits').innerHTML = '';
  (entry.benefits || []).forEach(b => addBenefitRow(b.text));
  document.querySelector('#evidenceFor').value = entry.evidenceFor || '';
  document.querySelector('#evidenceAgainst').value = entry.evidenceAgainst || '';
  document.querySelector('#tinyAction').value = entry.tinyAction || '';
  document.querySelector('#tinyWhen').value = entry.tinyWhen || '';
  document.querySelector('#reset').value = entry.reset || '';
  document.querySelector('#reflection').value = entry.reflection || '';
}

function readForm(){
  const scenarios = [...document.querySelectorAll('.scenario')].map(el => ({
    text: el.querySelector('.scenario-text').value.trim(),
    prob: Number(el.querySelector('.scenario-prob').value||0),
    plan: el.querySelector('.scenario-plan').value.trim(),
  })).filter(s => s.text);
  const benefits = [...document.querySelectorAll('.benefit-text')].map(el => ({text: el.value.trim()})).filter(b=>b.text);
  return {
    id: uid(),
    date: document.getElementById('date').value,
    title: document.getElementById('title').value.trim(),
    anxiety: document.getElementById('anxiety').value.trim(),
    scenarios,
    benefits,
    evidenceFor: document.getElementById('evidenceFor').value.trim(),
    evidenceAgainst: document.getElementById('evidenceAgainst').value.trim(),
    tinyAction: document.getElementById('tinyAction').value.trim(),
    tinyWhen: document.getElementById('tinyWhen').value,
    reset: document.getElementById('reset').value.trim(),
    reflection: document.getElementById('reflection').value.trim()
  };
}

function startNew(){
  populateForm({scenarios:[{}], benefits:[]});
  document.getElementById('nav-new').classList.add('active');
  document.getElementById('nav-list').classList.remove('active');
  window.scrollTo({top:0, behavior:'smooth'});
}

// ----- UI Events -----
document.addEventListener('DOMContentLoaded', async () => {
  // PIN lock boot
  setupLockUI();
  await showLock();

  // defaults (only after unlock will main show)
  document.getElementById('date').value = new Date().toISOString().slice(0,10);
  addScenarioRow();
  addBenefitRow();

  // nav
  document.getElementById('nav-new').addEventListener('click', (e)=>{e.preventDefault(); startNew();});
  document.getElementById('nav-list').addEventListener('click', (e)=>{e.preventDefault(); window.scrollTo({top:document.body.scrollHeight, behavior:'smooth'});});
  document.getElementById('nav-help').addEventListener('click', (e)=>{e.preventDefault(); document.getElementById('helpModal').hidden = false;});
  document.getElementById('closeHelp').addEventListener('click', ()=> document.getElementById('helpModal').hidden = true);

  // settings
  document.getElementById('openSettings').addEventListener('click', ()=> $('#settingsModal').hidden = false);
  document.getElementById('closeSettings').addEventListener('click', ()=> $('#settingsModal').hidden = true);
  document.getElementById('nukeBtn').addEventListener('click', ()=>{
    if(confirm('This will delete ALL local data for this app on this device, including your entries and PIN. Proceed?')){
      localStorage.removeItem('aj_db_v1');
      localStorage.removeItem(PIN_KEY);
      location.reload();
    }
  });
  document.getElementById('savePinBtn').addEventListener('click', async ()=>{
    const cur = $('#curPin').value.trim();
    const nxt = $('#newPin').value.trim();
    if(!/^\d{4}$/.test(nxt)){ $('#pinMsg').textContent='New PIN must be 4 digits.'; return; }
    if(await hasPin()){
      if(!(await verifyPin(cur))){ $('#pinMsg').textContent='Current PIN is incorrect.'; return; }
    }
    await setPin(nxt);
    $('#pinMsg').textContent='PIN updated.';
    $('#curPin').value=''; $('#newPin').value='';
  });

  // entry form submit
  document.getElementById('entryForm').addEventListener('submit', (e)=>{
    e.preventDefault();
    const entry = readForm();
    const db = loadDB();
    const existingIdx = db.entries.findIndex(x => x.id === entry.id);
    if(existingIdx >= 0) db.entries[existingIdx] = entry; else db.entries.push(entry);
    saveDB(db);
    renderEntries();
    startNew();
  });

  // list interactions
  entriesEl.addEventListener('click', (e)=>{
    const editId = e.target.getAttribute('data-edit');
    const delId = e.target.getAttribute('data-delete');
    if(editId){
      const db = loadDB();
      const entry = db.entries.find(x=>x.id===editId);
      if(entry){ populateForm(entry); window.scrollTo({top:0, behavior:'smooth'}); }
    } else if(delId){
      const db = loadDB();
      db.entries = db.entries.filter(x=>x.id!==delId);
      saveDB(db);
      renderEntries();
    }
  });

  // search/sort
  searchEl.addEventListener('input', renderEntries);
  sortEl.addEventListener('change', renderEntries);

  // export/import
  document.getElementById('exportBtn').addEventListener('click', ()=>{
    const data = JSON.stringify(loadDB(), null, 2);
    const blob = new Blob([data], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'anxiety-journal-data.json';
    a.click();
    URL.revokeObjectURL(url);
  });
  document.getElementById('importBtn').addEventListener('click', ()=> document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', async (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    const text = await file.text();
    try{
      const obj = JSON.parse(text);
      saveDB(obj);
      renderEntries();
      alert('Imported successfully');
    }catch{ alert('Invalid JSON'); }
  });

  renderEntries();
});

function setupLockUI(){
  const lock = $('#lockScreen');
  const dots = document.querySelectorAll('.pin-dots span');
  const action = $('#lockAction');
  const errorEl = $('#lockError');

  lock.addEventListener('click', (e)=>{
    const key = e.target.closest('.key');
    if(!key) return;
    if(key.id === 'clearKey'){ clearBuffer(); return; }
    if(key.id === 'delKey'){ PIN_STATE.buffer = PIN_STATE.buffer.slice(0,-1); pinDotsUpdate(); action.disabled = PIN_STATE.buffer.length !== 4; return; }
    const digit = key.textContent.trim();
    if(/\d/.test(digit) && PIN_STATE.buffer.length < 4){
      PIN_STATE.buffer += digit;
      pinDotsUpdate();
      action.disabled = PIN_STATE.buffer.length !== 4;
    }
  });

  action.addEventListener('click', async ()=>{
    if(PIN_STATE.buffer.length !== 4) return;
    if(PIN_STATE.stage === 'unlock'){
      if(await verifyPin(PIN_STATE.buffer)){
        clearBuffer();
        hideLock();
      } else {
        errorEl.textContent = 'Incorrect PIN. Try again.';
        clearBuffer();
      }
    } else if(PIN_STATE.stage === 'set1'){
      PIN_STATE.firstHash = await sha256(PIN_STATE.buffer);
      PIN_STATE.stage = 'set2';
      $('#lockTitle').textContent = 'Confirm PIN';
      $('#lockSubtitle').textContent = 'Re-enter to confirm.';
      $('#lockAction').textContent = 'Set PIN';
      clearBuffer();
    } else if(PIN_STATE.stage === 'set2'){
      const conf = await sha256(PIN_STATE.buffer);
      if(conf !== PIN_STATE.firstHash){
        errorEl.textContent = 'PINs do not match. Start over.';
        PIN_STATE.stage = 'set1';
        $('#lockTitle').textContent = 'Set your PIN';
        $('#lockSubtitle').textContent = 'Create a 4‑digit PIN to protect your journal.';
        $('#lockAction').textContent = 'Continue';
        clearBuffer();
      } else {
        await setPin(PIN_STATE.buffer);
        clearBuffer();
        hideLock();
      }
    }
  });
}

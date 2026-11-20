window.SwarmSettings = (() => {
  'use strict';
  const key = 'swarmArena.preferences', version = 3;
  const modes = ['3','5','zombie'];
  const schema = new Map(), pending = new Map(), listeners = new Set();
  const controls = [...document.querySelectorAll('#statsPanel input, #statsPanel select, #spawnPanel input')];
  const panelFields = ['statsOpacity','spawnOpacity'];
  const modePath = (mode, field) => 'modes.' + mode + '.' + field;
  const pathFor = (el, mode) => el.id === 'mode' ? 'game.mode' : panelFields.includes(el.id) ? 'hud.' + el.id : modePath(mode, el.id);
  const numeric = (d,lo,hi,step=0) => ({d,valid:v=>Number.isFinite(v) && v>=lo && v<=hi && (!step || Math.abs((v-lo)/step-Math.round((v-lo)/step))<1e-6)});
  const choice = (d,values) => ({d,valid:v=>values.includes(v)});
  const color = {d:'theme',valid:v=>v==='theme'||(typeof v==='string' && /^#[0-9a-f]{6}$/i.test(v))};
  const bool = d => ({d,valid:v=>typeof v==='boolean'});
  const register = (path, spec) => schema.set(path,spec);
  const valueOf = e => e.type === 'checkbox' ? e.checked : e.tagName === 'SELECT' ? e.value : e.valueAsNumber;
  for (const mode of modes) {
    for (const el of controls) {
      let spec;
      if (el.type==='checkbox') spec=bool(el.defaultChecked);
      else if (el.tagName==='SELECT') spec=choice(el.value,[...el.options].map(o=>o.value));
      else spec=numeric(el.id==='population' && mode==='zombie' ? 500 : el.valueAsNumber, Number(el.min), Number(el.max), Number(el.step)||1);
      register(pathFor(el,mode),spec);
    }
    const kinds = mode==='zombie' ? ['human','zombie'] : ['rock','paper','scissors','lizard','spock'].slice(0,Number(mode));
    const option=(field,spec)=>register(modePath(mode,field),spec);
    for(const [section,items] of Object.entries(SwarmOptions)) {
      if(section==='outbreak' && mode!=='zombie') continue;
      for(const [name,,value,lo,hi,step] of items) option(name,numeric(value,lo,hi,step));
    }
    if(mode==='zombie'){
      option('idleInterrupt',bool(true));option('spreadFear',bool(true));
      option('initialZombies',numeric(0,0,15000,1));
    }
    option('seedMode',choice('random',['random','fixed']));
    option('seed',{d:'swarm',valid:v=>typeof v==='string' && v.length<=128});
    option('distribution',choice('jitter',['jitter','grid']));
    option('inspect',bool(false));
    for(const kind of kinds){
      if(mode!=='zombie')option('count.'+kind,numeric(-1,-1,15000,1));
      const prefix='ai.'+kind+'.';
      option(prefix+'enabled',bool(true));option(prefix+'fov',bool(mode==='zombie'));
      option(prefix+'angle',numeric(90,1,360,1));option(prefix+'sight',numeric(5,0,100,.25));
      option(prefix+'hearing',numeric(4,0,100,.25));
    }
    for(const kind of kinds) register(modePath(mode,'colors.'+kind),color);
    register(modePath(mode,'pick'),choice(null,[null,...kinds]));
    register(modePath(mode,'brush'),choice(mode==='zombie'?'zombie':null,[null,...kinds]));
    register(modePath(mode,'diagram'),bool(true));
    register(modePath(mode,'diagramOpacity'),numeric(34,0,100,1));
    register(modePath(mode,'camera'),{d:{x:0,y:0,zoom:1},valid:v=>v && Object.keys(v).length===3 && [v.x,v.y,v.zoom].every(Number.isFinite) && Math.abs(v.x)<=1e14 && Math.abs(v.y)<=1e14 && v.zoom>=1e-5 && v.zoom<=1e5});
  }
  register('theme.id',choice('classic',Object.keys(SwarmRegistry)));
  for (const widget of ['population','toolbar','states']) {
    register('hud.'+widget+'.auto',bool(false));
    register('hud.'+widget+'.enter',numeric(600,0,10000,1));
    register('hud.'+widget+'.exit',numeric(2000,0,30000,1));
  }
  for (const part of ['bar','text','toolbar','states']) register('hud.'+part+'.transparency',numeric(0,0,100,1));
  register('hud.states.visible',bool(true));
  register('hud.states.expanded',bool(false));
  for (const id of ['statsPanel','spawnPanel']) register('hud.'+id,choice('auto',['auto','open','closed']));
  register('grid.visible',bool(true));
  register('grid.labels',bool(true));
  register('grid.referenceMeters',numeric(.48,.1,2));
  for (const field of ['minor','major','axis']) register('grid.'+field,color);
  const defaults = Object.fromEntries([...schema].map(([path,spec])=>[path,spec.d]));
  let saved = {}, timer, blocked = false, warning = '', available = true;
  function warn(message) {
    warning=message; const el=document.getElementById('storageWarning');
    el.textContent=message; el.hidden=!message;
  }
  function validate(fields) {
    if (!fields || typeof fields!=='object' || Array.isArray(fields)) throw Error('Invalid preferences');
    for (const [path,value] of Object.entries(fields)) {
      if (!schema.has(path) || !schema.get(path).valid(value)) throw Error('Unsupported preference: '+path);
    }
    return fields;
  }
  function decode(raw, installedOnly=false) {
    if (raw===null) return {};
    const record=JSON.parse(raw);
    if (installedOnly && record.preferences && typeof record.preferences['theme.id']==='string' && !Object.hasOwn(SwarmRegistry,record.preferences['theme.id'])) record.preferences['theme.id']='classic';
    if (!record || !record.preferences || typeof record.preferences!=='object' || Array.isArray(record.preferences)) throw Error('Invalid settings envelope');
    if (record.schemaVersion===1) {
      const fields={...record.preferences};
      if (Object.hasOwn(fields,'theme')) { fields['theme.id']=fields.theme; delete fields.theme; }
      record.preferences=fields;record.schemaVersion=2;
    }
    if(record.schemaVersion===2){
      const f=record.preferences;
      for(const kind of ['human','zombie']) for(const [old,next] of [['fovAngle','angle'],['fovRange','sight'],['hearingRange','hearing']]){
        const source=modePath('zombie',old),dest=modePath('zombie','ai.'+kind+'.'+next);
        if(Object.hasOwn(f,source) && !Object.hasOwn(f,dest))f[dest]=f[source];
      }
      const retired=['crowdFlanking','crowdThreshold','alternateRange','scoutChance','scoutDuration','fovAngle','fovRange','hearingRange'];
      for(const m of modes)for(const name of retired)delete f[modePath(m,name)];
    } else if(record.schemaVersion!==version) throw Error('Unsupported settings version');
    if(installedOnly) return Object.fromEntries(Object.entries(record.preferences).filter(([p,v])=>schema.get(p)?.valid(v)));
    return validate(record.preferences);
  }
  function loadSettings() {
    try {
      const raw=localStorage.getItem(key);
      saved=decode(raw,true);
      if(raw && JSON.parse(raw).schemaVersion<version) localStorage.setItem(key,JSON.stringify(envelope(saved)));
      const probe='swarmArena.writeProbe.'+Math.random();
      localStorage.setItem(probe,'1'); localStorage.removeItem(probe);
    } catch (e) {
      available=false; blocked=true;
      warn('Settings are in memory. Stored data could not be opened or written. '+e.message);
    }
  }
  const envelope = fields => ({schemaVersion:version,lastUpdated:new Date().toISOString(),preferences:fields});
  function getSetting(path) {
    if (!schema.has(path)) throw Error('Unknown setting: '+path);
    const value=pending.has(path) ? pending.get(path) : saved[path];
    return value===undefined ? defaults[path] : value;
  }
  function flushNow() {
    clearTimeout(timer);
    if (!pending.size || blocked) return;
    try {
      const latest=decode(localStorage.getItem(key),true);
      const remote=[...schema.keys()].filter(p=>!pending.has(p) && JSON.stringify(saved[p])!==JSON.stringify(latest[p]));
      for (const [p,v] of pending) { if (v===undefined) delete latest[p]; else latest[p]=v; }
      localStorage.setItem(key,JSON.stringify(envelope(latest))); saved=latest; pending.clear();
      available=true; warn(''); if(remote.length) notify(remote,'remote');
    } catch(e) { available=false; warn('Settings are in memory. Changes may not persist. '+e.message); }
  }
  const flush = () => navigator.locks ? navigator.locks.request(key,flushNow) : flushNow();
  function notify(paths, source) { for(const fn of listeners) fn(paths,source); }
  function setSetting(path,value,source='local') {
    validate({[path]:value});
    if (JSON.stringify(getSetting(path))===JSON.stringify(value)) return;
    pending.set(path,value); clearTimeout(timer); timer=setTimeout(flush,100); notify([path],source);
  }
  function resetSetting(scope='') {
    const paths=[...schema.keys()].filter(p=>!scope || p===scope || p.startsWith(scope+'.'));
    for (const p of paths) pending.set(p,undefined);
    if (!scope && blocked) {try{localStorage.removeItem(key); blocked=false;}catch{}}
    flushNow(); notify(paths,'reset');
  }
  function exportSettings() {
    return JSON.stringify(envelope(Object.fromEntries([...schema.keys()].map(p=>[p,getSetting(p)]))),null,2);
  }
  function importSettings(raw) {
    if(typeof raw!=='string' || raw.length>512000) throw Error('Settings file is too large');
    const fields=decode(raw);
    for(const p of schema.keys()) pending.set(p,fields[p]);
    flushNow(); notify([...schema.keys()],'import');
  }
  // Explicitly own only these records. Future adapters must extend this list.
  function clearAll() {
    clearTimeout(timer); pending.clear(); saved={};
    try { localStorage.removeItem(key); blocked=false; available=true; warn(''); }
    catch(e) { available=false; warn('Local data could not be cleared. '+e.message); }
    notify([...schema.keys()],'clear');
  }
  window.addEventListener('storage',e=>{
    if(e.key!==key && e.key!==null) return;
    try {
      const next=decode(localStorage.getItem(key),true);
      const changed=[...schema.keys()].filter(p=>!pending.has(p) && JSON.stringify(saved[p])!==JSON.stringify(next[p]));
      saved=next; blocked=false; available=true; warn(''); notify(changed,'remote');
    } catch(e) { blocked=true; available=false; warn('Stored settings could not be read. '+e.message); }
  });
  function restoreControls(mode) {
    for(const el of controls) {
      const v=getSetting(pathFor(el,mode));
      if(el.type==='checkbox') el.checked=v; else el.value=v;
    }
  }
  loadSettings();
  restoreControls(getSetting('game.mode'));
  window.addEventListener('pagehide',flushNow);
  document.addEventListener('visibilitychange',()=>{if(document.hidden) flushNow();});
  return {key,version,modes,modePath,pathFor,valueOf,controls,schema,getSetting,setSetting,loadSettings,restoreControls,
    resetSetting,clearAll,exportSettings,importSettings,flush,subscribe:fn=>(listeners.add(fn),()=>listeners.delete(fn)),
    status:()=>({available,warning,savedKeys:[...new Set([...Object.keys(saved),...pending.keys()])].filter(p=>!pending.has(p)||pending.get(p)!==undefined)})};
})();

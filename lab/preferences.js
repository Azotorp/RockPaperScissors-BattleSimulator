// The lab and main arena share the dev preference envelope and the same write lock.
window.SwarmLabPreferences=(()=>{
  const key='swarmArena.dev.preferences', path='lab.preferences', legacy='swarmArena.dev.lab';
  const defaults={backend:'Auto',n:1000,species:'3',boundary:'walls',sense:'all',cadence:'1',view:'1'};
  const allowed={backend:['Auto','CPU','GPU'],species:['3','5','battle3','battle5','outbreak'],boundary:['walls','wrap'],
    sense:['all','fov'],cadence:['1','4','8'],view:['.25','1','4']};
  function valid(v){
    return v && typeof v==='object' && Number.isInteger(v.n) && v.n>0 && v.n<=1e6 &&
      Object.keys(v).length===Object.keys(defaults).length &&
      Object.keys(allowed).every(k=>allowed[k].includes(v[k]));
  }
  function read(siteDefaults=defaults){
    try{
      const stored=JSON.parse(localStorage.getItem(key));
      const record=stored?.preferences?.[path];
      if(valid(record))return record;
      const old={...siteDefaults,...JSON.parse(localStorage.getItem(legacy))};
      if(valid(old))return old;
    }catch{}
    return {...siteDefaults};
  }
  async function write(values){
    if(!valid(values))return;
    function save(){
      const raw=localStorage.getItem(key);
      const record=raw===null?{schemaVersion:3,preferences:{}}:JSON.parse(raw);
      if(record?.schemaVersion!==3 || !record.preferences || typeof record.preferences!=='object' || Array.isArray(record.preferences))
        throw Error('Open the dev arena to migrate or recover saved preferences.');
      record.preferences[path]=values;record.lastUpdated=new Date().toISOString();
      localStorage.setItem(key,JSON.stringify(record));localStorage.removeItem(legacy);
    }
    if(navigator.locks)await navigator.locks.request(key,save);else save();
  }
  return {defaults,valid,read,write,path,legacy};
})();

window.SwarmWindow = (() => {
  const S=SwarmSettings, T=SwarmThemes, V=SwarmArenaView;
  const dialog=document.getElementById('settingsWindow'), body=document.getElementById('settingsBody');
  const mode=()=>S.getSetting('game.mode'), per=k=>S.modePath(mode(),k);
  let tab='General';
  function element(tag,text,parent) {
    const el=document.createElement(tag);
    if(text!==null) el.textContent=text;
    if(parent) parent.append(el);
    return el;
  }
  function button(text,fn,parent=body) {
    const b=element('button',text,parent);b.type='button';b.onclick=fn;return b;
  }
  function group(label) { const g=element('fieldset',null,body);element('legend',label,g);return g; }
  function field(group,label,path,type,{lo,hi,step=1,suffix='',choices}={}) {
    const row=element('label',null,group);row.className='setting-row';element('span',label,row);
    const el=element(choices?'select':'input',null,row);el.dataset.path=path;
    if(choices) for(const [k,v] of Object.entries(choices)) el.add(new Option(v,k));
    else el.type=type;
    const current=S.getSetting(path);
    if(type==='checkbox') el.checked=current;
    else if(type==='color' && current==='theme') el.value=path.startsWith('grid.') ? getComputedStyle(document.documentElement).getPropertyValue('--grid-'+path.split('.').at(-1)).trim() : T.theme.categoryColors[path.split('.').at(-1)];
    else el.value=current;
    if(lo!==undefined){el.min=lo;el.max=hi;el.step=step;el.value=current;}
    const out=type==='range'?element('output',current+suffix,row):null;
    el.addEventListener('input',()=>{
      const v=el.type==='checkbox'?el.checked:['number','range'].includes(el.type)?el.valueAsNumber:el.value;
      if(!S.schema.get(path).valid(v)) return;
      S.setSetting(path,v);if(out) out.textContent=v+suffix;
    });
    el.onchange=()=>{if(type!=='checkbox' && !el.validity.valid)el.value=S.getSetting(path);S.flush();};
  }
  function interfacePage() {
    const general=group('Appearance');
    field(general,'Overlay background transparency','hud.backgroundTransparency','range',{lo:0,hi:100,suffix:'%'});
    button('Move overlays',()=>{dialog.close();SwarmOverlayLayout.edit();},general);
    button('Reset overlay positions',()=>SwarmOverlayLayout.reset(),general);
    field(general,'Theme','theme.id',null,{choices:Object.fromEntries(Object.values(T.registry).map(t=>[t.id,t.displayName]))});
    if(mode()!=='zombie'){
      field(general,'Show rules diagram',per('diagram'),'checkbox');
      field(general,'Diagram opacity',per('diagramOpacity'),'range',{lo:0,hi:100,suffix:'%'});
    }
    for(const [key,title] of [['population','Population HUD'],['toolbar','Controls / Spawn / Focus'],['states','Outbreak state legend']]){
      const g=group(title), prefix='hud.'+key+'.';
      if(key==='states') field(g,'Show in Outbreak mode',prefix+'visible','checkbox');
      for(const [id,label] of key==='population'?[['bar','Bar transparency'],['text','Legend transparency']]:[[key,'Content transparency']])
        field(g,label,'hud.'+id+'.transparency','range',{lo:0,hi:100,suffix:'%'});
      field(g,'Auto-hide',prefix+'auto','checkbox');
      field(g,'Reveal delay (ms)',prefix+'enter','number',{lo:0,hi:10000});
      field(g,'Hide delay (ms)',prefix+'exit','number',{lo:0,hi:30000});
    }
    const colors=group('Category colors · current mode');
    const prefix=per('colors.');
    for(const path of S.schema.keys()) if(path.startsWith(prefix)){
      const kind=path.slice(prefix.length);field(colors,kind[0].toUpperCase()+kind.slice(1),path,'color');
    }
    button('Use theme colors',()=>{if(confirm('Restore the theme colors for this mode?')){S.resetSetting(per('colors'));render();}},colors);
  }
  function gridPage(){
    const grid=group('Metric grid');
    field(grid,'Show grid','grid.visible','checkbox');field(grid,'Show signed coordinates','grid.labels','checkbox');
    field(grid,'Reference shoulder width (m)','grid.referenceMeters','number',{lo:.1,hi:2,step:.01});
    for(const id of ['minor','major','axis']) field(grid,id[0].toUpperCase()+id.slice(1)+' line color','grid.'+id,'color');
  }
  function previewPage() {
    const diagnostics=T.diagnostics();
    element('p',diagnostics.theme+' · '+diagnostics.textures+' cached arena textures · '+diagnostics.animatedStates+' animated states loaded',body);
    const gallery=element('div',null,body);gallery.className='preview-grid';
    for(const id of ['H','Hs','Hi','Z','Zi','Zh','Zc','Za','R','P','Sc','L','Sp']) {
      const f=element('figure',null,gallery), img=element('img',null,f);
      img.src=T.icon(id);img.alt=V.stateLabels[id] || Object.keys(T.codes).find(k=>T.codes[k]===id) || id;
      img.dataset.state=id;element('figcaption',img.alt,f);
    }
    const sample=group('Outbreak legend preview');
    const values=Object.fromEntries(Object.keys(V.stateLabels).map((id,i)=>[id,i+1]));
    const items=element('div',null,sample);items.className='state-items';V.stateList(items,values);
  }
  const friendly=p=>p.replace(/([a-z])([A-Z])/g,'$1 $2').replaceAll('.',' › ');
  function dataPage() {
    const {available,warning,savedKeys}=S.status(), cats=[...new Set(savedKeys.map(p=>p.split('.')[0]))];
    element('p',(available?'Browser storage available':'Memory-only settings')+' · Schema '+S.version,body);
    if(warning) element('p',warning,body);
    element('p','Storage namespace: '+S.key,body);
    element('p','Saved categories: '+(cats.join(', ')||'none')+'. Settings stay in this browser profile on this site. Clearing site data can erase them.',body);
    const groups=new Map();
    for (const path of [...S.schema.keys()].sort()) {
      const parts=path.split('.'), category=parts[0]==='modes'?parts.slice(0,2).join('.'):parts[0];
      if(!groups.has(category)) {
        const details=element('details',null,body);
        const name=category.startsWith('modes.')?'Mode · '+({'3':'Classic','5':'Lizard–Spock',zombie:'Outbreak'}[parts[1]]):friendly(category);
        element('summary',name,details);const list=element('dl',null,details);
        button('Reset '+name,()=>{if(confirm('Restore '+name+' settings to defaults?')){S.resetSetting(category);render();}},details);
        groups.set(category,list);
      }
      const v=S.getSetting(path);element('dt',friendly(path.slice(category.length+1)),groups.get(category));
      element('dd',v===null?'None':typeof v==='object'?JSON.stringify(v):String(v),groups.get(category));
    }
    const actions=element('div',null,body);actions.className='data-actions';
    button('Export settings',()=>{
      const url=URL.createObjectURL(new Blob([S.exportSettings()],{type:'application/json'}));
      const a=element('a',null);a.href=url;a.download='default.config.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    },actions);
    const file=element('input',null,body);file.type='file';file.accept='.json,application/json';file.hidden=true;
    button('Import settings',()=>file.click(),actions);
    file.onchange=async()=>{try{if(!file.files[0])return;if(file.files[0].size>512000)throw Error('File too large');S.importSettings(await file.files[0].text());render();}catch(e){element('p','Import failed. '+e.message,body).setAttribute('role','alert');}};
    button('Reset all settings',()=>{if(confirm('Reset every mode, camera, HUD and theme preference to defaults?')){S.resetSetting();render();}},actions);
    button('Clear all Swarm Arena data',()=>{if(confirm('Delete all local Swarm Arena data? This build stores preferences only.')){S.clearAll();render();}},actions).className='danger';
  }
  // Keep the original control nodes and listeners when moving between pages.
  const parking=element('div',null,document.body);parking.hidden=true;
  const movable=new Map();
  const sections={
    'General':['immunityTime','unlimitedTime','survivalTime'],
    'Camera':['markerThreshold'],
    'Movement':['rpsSpeed','headsAcross'],
    'Perception':['showFov','showHearing'],
    'Human fear':['wanderSpeed','fleeSpeed','staminaStart','staminaDrain','staminaMinSpeed','staminaRest'],
    'Zombie states':['zombieSpeed','zombieBoostRange','zombieBoostFactor'],
    'Physics':['aiInterval','showBounds'],
    'Spawning':['spawnExtent']
  };
  for(const id of Object.values(sections).flat()){
    const node=document.getElementById(id),row=node.closest('.row');
    movable.set(id,row);parking.append(row);
  }
  for(const section of document.querySelectorAll('#statsPanel .section'))section.hidden=true;
  function original(parent,ids) {
    for(const id of ids){const row=movable.get(id);if(row)parent.append(row);}
  }
  function specs(parent,rows) {
    for(const [key,label,,lo,hi,step] of rows)field(parent,label,per(key),'number',{lo,hi,step});
  }
  function gameplayPage(name){
    const outbreak=mode()==='zombie';
    if(['Human fear','Zombie states','Infection'].includes(name)&&!outbreak){
      element('p','These settings apply to Zombie Outbreak. Select that game mode to edit them.',body);return;
    }
    const g=group(name);
    const old=sections[name]||[];
    original(g,old.filter(id=>!(id==='rpsSpeed'&&outbreak) && !(['spawnExtent','unlimitedTime','survivalTime'].includes(id)&&!outbreak)));
    if(name==='General'){
      field(g,'Game mode','game.mode',null,{choices:{3:'Classic',5:'Lizard–Spock',zombie:'Zombie Outbreak'}});
      field(g,'Focused creature inspector',per('inspect'),'checkbox');
      const build=window.SwarmBuild;
      const info=group('Development build');
      element('p','Version v'+build.version+' · Channel '+build.channel.toUpperCase(),info);
      element('p','Based on source commit '+build.baseCommit.slice(0,12)+' · '+build.releaseDate,info);
      element('p',build.notes,info);
      element('p','Development preferences are separate from the live game.',info);
    }else if(name==='Camera'){
      element('p','Drag with two fingers to pan. Spread to zoom in. Your pan and zoom are saved for this mode.',g);
      button('Fit view',()=>document.getElementById('fit').click(),g);
    }else if(name==='Movement')specs(g,SwarmOptions.movement);
    else if(name==='Perception'){
      const kinds=outbreak?['human','zombie']:['rock','paper','scissors','lizard','spock'].slice(0,Number(mode()));
      for(const kind of kinds){
        const f=group(kind[0].toUpperCase()+kind.slice(1)),prefix=per('ai.'+kind+'.');
        field(f,'Enable AI',prefix+'enabled','checkbox');field(f,'Limit awareness to sight and hearing',prefix+'fov','checkbox');
        field(f,'Sight cone (degrees)',prefix+'angle','number',{lo:1,hi:360});
        for(const k of ['sight','hearing'])field(f,k[0].toUpperCase()+k.slice(1)+' radius (head widths)',prefix+k,'number',{lo:0,hi:100,step:.25});
      }
    }else if(name==='Spawning'){
      element('p','Initial placement settings apply next round. Brush controls apply immediately.',g);
      field(g,'Seed mode',per('seedMode'),null,{choices:{random:'Fresh each round',fixed:'Reuse fixed seed'}});
      field(g,'Fixed seed',per('seed'),'text');
      field(g,'Distribution',per('distribution'),null,{choices:{jitter:'Evenly spaced with jitter',grid:'Uniform grid'}});
      specs(g,SwarmOptions.spawning);
      field(g,'Mass spawn on click or tap',per('massSpawn'),'checkbox');
      field(g,'Creatures per burst',per('spawnBurst'),'range',{lo:1,hi:250,step:1});
      field(g,'Spawn interval',per('spawnRate'),'range',{lo:0,hi:600,step:5,suffix:' ms'});
      field(g,'Spawn spread',per('spawnSpread'),'range',{lo:0,hi:4,step:.25,suffix:' heads'});
      if(outbreak)field(g,'Starting zombies',per('initialZombies'),'number',{lo:0,hi:999999});
      else {
        const mix=group('Initial counts · −1 uses the shared population');
        for(const kind of ['rock','paper','scissors','lizard','spock'].slice(0,Number(mode())))field(mix,kind,per('count.'+kind),'number',{lo:-1,hi:999999});
      }
      const seed=window.SwarmRound?.seed??'';
      const line=element('p','Current round seed · '+seed,g);
      const setSeed=value=>{S.setSetting(per('seed'),value);S.setSetting(per('seedMode'),'fixed');render();};
      button('Reuse current',()=>setSeed(seed),g);
      button('Randomize fixed seed',()=>setSeed(crypto.getRandomValues(new Uint32Array(2)).join('-')),g);
      button('Copy current',async()=>{try{await navigator.clipboard.writeText(seed);line.textContent='Copied · '+seed;}catch{line.textContent='Select and copy · '+seed;}},g);
    }else if(name==='Physics')specs(g,SwarmOptions.physics);
    else if(name==='Human fear'){
      field(g,'Spread fear to nearby humans',per('spreadFear'),'checkbox');specs(g,SwarmOptions.outbreak.slice(0,2));
    }else if(name==='Zombie states'){
      specs(g,SwarmOptions.outbreak.slice(2,6));
      element('p','A new zombie wakes when it detects a human or sees an active zombie. It hunts until it finds a human to chase or bite.',g);
    }else if(name==='Infection')specs(g,SwarmOptions.outbreak.slice(6));
    const controls=[...body.querySelectorAll('input,select')];
    if(controls.some(el=>el.dataset.path||el.id))button('Reset this section',()=>{
      if(!confirm('Restore '+name+' settings for this mode?'))return;
      const paths=controls.map(el=>el.dataset.path||S.pathFor(el,mode())).filter(p=>p!=='game.mode');
      for(const path of paths)S.resetSetting(path);render();
    });
  }
  const pages={...Object.fromEntries(['General','Camera','Movement','Perception','Human fear','Zombie states','Infection','Physics','Spawning'].map(name=>[name,()=>gameplayPage(name)])),'World & grid':gridPage,'Interface':interfacePage,'State preview':previewPage,'Data & Storage':dataPage};
  function render() {
    for(const row of movable.values())if(body.contains(row))parking.append(row);
    body.replaceChildren();pages[tab]();
    for(const b of document.querySelectorAll('#settingTabs button')) b.setAttribute('aria-current',String(b.textContent===tab));
  }
  for(const name of Object.keys(pages)) button(name,()=>{tab=name;render();},document.getElementById('settingTabs'));
  document.getElementById('settingsOpen').onclick=()=>{render();dialog.showModal();};
  document.getElementById('settingsClose').onclick=()=>dialog.close();
  S.subscribe((paths,source)=>{if(dialog.open && (source==='remote'||paths.includes('game.mode'))) render();});
  return {render,open:()=>dialog.open};
})();

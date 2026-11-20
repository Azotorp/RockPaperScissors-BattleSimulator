(async () => {
  'use strict';

  if (!window.PIXI || !window.p2) throw new Error('PixiJS and p2.js must load before main.js');

  const { Application, Container, Graphics, Sprite } = PIXI;
  const $ = id => document.getElementById(id);
  const RPS_TYPES = ['rock', 'paper', 'scissors', 'lizard', 'spock'];
  const RPS3 = { rock: ['scissors'], paper: ['rock'], scissors: ['paper'] };
  const RPS5 = {
    rock: ['scissors', 'lizard'], paper: ['rock', 'spock'],
    scissors: ['paper', 'lizard'], lizard: ['paper', 'spock'],
    spock: ['rock', 'scissors']
  };
  const T = SwarmThemes, S = SwarmSettings, V = SwarmArenaView;
  const get = S.getSetting, modeKey = field => S.modePath(mode,field);
  const COLORS = {}, ink = {};
  const requestedTheme = get('theme.id');
  const stateOf = u => u.visualState || (u.type === 'human' && u.scared ? 'Hs' : T.codes[u.type]);
  function readColors() {
    for (const kind of Object.keys(T.theme.categoryColors)) COLORS[kind] = parseInt(V.categoryColor(kind).slice(1),16);
    const css = getComputedStyle(document.documentElement);
    for(const name of ['ground','marker-edge','immunity','vision-zombie','vision-scared','vision-human','win','loss','export-border','grid-text','window-text','window-font'])
      ink[name] = css.getPropertyValue('--'+name).trim();
    V.applyPalette();
  }
  const TAU = 2 * Math.PI, DT = 1 / 60;
  const MIN_ZOOM = 1e-5, MAX_ZOOM = 1e5;
  const requestedHeads = () => Math.max(20, Number($('headsAcross').value) || 60);
  const calculatedHead = () => Math.max(8, Math.max(innerWidth, innerHeight) / requestedHeads());
  let HEAD = calculatedHead(), RADIUS = HEAD * .44, CATCH = RADIUS * 2 + Math.max(1, HEAD * .05);
  const rpsSpeed = () => Number($('rpsSpeed').value);
  const wanderSpeed = () => Number($('wanderSpeed').value);
  const fleeSpeed = () => Number($('fleeSpeed').value);
  const zombieSpeed = () => Number($('zombieSpeed').value);
  const staminaStart = () => Number($('staminaStart').value);
  const staminaDrain = () => Number($('staminaDrain').value);
  const staminaRest = () => Number($('staminaRest').value);
  const staminaMinSpeed = () => Number($('staminaMinSpeed').value) / 100;
  const zombieBoostDistance = () => Number($('zombieBoostRange').value) * HEAD;
  const zombieBoostFactor = () => Number($('zombieBoostFactor').value);
  const aiInterval = () => Math.max(1, Number($('aiInterval').value) || 1);
  const maxCreatures = 15000; // protect browser against accidental infinite allocation

  const fixationLimits = () => {
    const lo = Number($('fixationMin').value), hi = Number($('fixationMax').value);
    return [Math.min(lo, hi), Math.max(lo, hi)];
  };
  const immunitySeconds = () => Number($('immunityTime').value);
  const startIds = T.stateIds;
  const app = new Application();
  await app.init({
    resizeTo: window, backgroundAlpha: 0, antialias: true,
    resolution: Math.min(devicePixelRatio || 1, 2)
  });
  $('game').appendChild(app.canvas);
  async function stageTheme(id, ids) {
    const loaded = await T.loadStates(id,ids);
    const url = 'assets/themes/' + id + '/' + T.registry[id].stylesheet;
    const old = $('themeStyle');
    if (new URL(old.href).pathname !== new URL(url, document.baseURI).pathname) {
      const link = document.createElement('link'); link.rel='stylesheet';
      await new Promise((resolve,reject)=>{
        link.onload=resolve; link.onerror=()=>{link.remove();reject(Error('Theme stylesheet unavailable'));};
        link.href=url;old.after(link);
      });
      old.remove();link.id='themeStyle';
    }
    T.activate(id,loaded);readColors();
  }
  try {await stageTheme(requestedTheme,startIds);}
  catch(e){console.warn(e);await stageTheme('classic',startIds);S.setSetting('theme.id','classic');}
  const camera = new Container();
  const visionLayer = new Container(), actors = new Container();
  const markerLayer = new Graphics();
  app.stage.addChild(camera, markerLayer);
  camera.addChild(visionLayer, actors);
  const sightGraphics = new Graphics(), hearingGraphics = new Graphics();
  visionLayer.addChild(hearingGraphics, sightGraphics);

  const world = new p2.World({ islandSplit:false, gravity: [0, 0], broadphase: new p2.SAPBroadphase() });
  // All species now participate in physical p2 contacts. Conversion still
  // follows the game rules and swept collision tests prevent fast misses.
  world.solver.iterations = 3;
  const CONTACT_GROUP = {
    rock: 1, paper: 2, scissors: 4, lizard: 8, spock: 16,
    human: 32, zombie: 64
  };
  const ALL_CONTACTS = 127;
  function setContactFilter(shape, type) {
    shape.collisionGroup = CONTACT_GROUP[type];
    shape.collisionMask = ALL_CONTACTS;
  }
  world.defaultContactMaterial.friction = 0;
  world.defaultContactMaterial.restitution = 0.13;
  const physicalPairs=new Map();
  const contactKey=(a,b)=>a.sequence<b.sequence?a.sequence+','+b.sequence:b.sequence+','+a.sequence;
  for(const eventName of ['beginContact','endContact'])world.on(eventName,e=>{
    const a=e.bodyA.agent,b=e.bodyB.agent;if(!a||!b)return;
    const key=contactKey(a,b);
    if(eventName==='beginContact'){
      physicalPairs.set(key,[a,b]);(a.pairKeys??=new Set()).add(key);(b.pairKeys??=new Set()).add(key);
    }else {physicalPairs.delete(key);a.pairKeys?.delete(key);b.pairKeys?.delete(key);}
  });
  let scale = 1, units = [], mode = '3', chosen = null, brush = null;
  let state = 'ready', t = 0, accumulator = 0, stepNumber = 0, lastUI = -1;
  let outbreakAt = null, seeded = false;
  let rightDown = false, leftDown = false, lastPointer = null, lastPaint = 0;
  let lastLeftPoint = null, leftDownAt = 0;
  let focusArmed = false, focusedUnit = null;
  let lastVisionDraw = 0;
  const hash = new Map();
  let cellWidth=40;
  const isZombieMode = () => mode === 'zombie';
  const active = () => isZombieMode() ? ['human', 'zombie'] : RPS_TYPES.slice(0, mode === '3' ? 3 : 5);
  const beats = (attacker, victim) => (mode === '3' ? RPS3 : RPS5)[attacker]?.includes(victim) ?? false;
  const visibleWorld = () => ({
    left: -camera.x / scale, top: -camera.y / scale,
    right: (innerWidth - camera.x) / scale, bottom: (innerHeight - camera.y) / scale
  });
  const unlimitedOutbreak = () => $('unlimitedTime').checked;
  const survivalSeconds = () => Math.max(1, Math.min(86400, Number($('survivalTime').value) || 120));


  function index() {
    hash.clear();cellWidth=Math.max(8,CATCH*2);
    for (const u of units) {
      const ix = Math.floor(u.body.position[0] / cellWidth), iy = Math.floor(u.body.position[1] / cellWidth);
      const k = `${ix},${iy}`;
      let bucket = hash.get(k);
      if (!bucket) hash.set(k, bucket = []);
      bucket.push(u);
    }
  }
  function query(x, y, r, fn) {
    const ax = Math.floor((x - r) / cellWidth), bx = Math.floor((x + r) / cellWidth);
    const ay = Math.floor((y - r) / cellWidth), by = Math.floor((y + r) / cellWidth);
    if((bx-ax+1)*(by-ay+1)>Math.max(64,hash.size*2)){
      for(const u of units){const p=u.body.position;if(Math.abs(p[0]-x)<=r && Math.abs(p[1]-y)<=r)fn(u);}
      return;
    }
    for (let i = ax; i <= bx; i++) for (let j = ay; j <= by; j++) {
      const bucket = hash.get(`${i},${j}`);
      if (bucket) for (const u of bucket) fn(u);
    }
  }
  function redraw() {
    V.drawMap({x:camera.x,y:camera.y,zoom:scale,width:innerWidth,height:innerHeight,
      metersPerWorldUnit:get('grid.referenceMeters')/20,boundary,wallPx:wallThickness,style:$('borderStyle').value,bounds:arena});
  }
  function drawCrosshairs(){
    const tiny=HEAD*scale<Number($('markerThreshold').value);
    markerLayer.clear();
    const byKind=new Map();
    const pad=Math.max(12,HEAD*scale);
    for(const u of units){
      const x=camera.x+u.body.position[0]*scale,y=camera.y+u.body.position[1]*scale;
      const visible=x>=-pad&&x<=app.screen.width+pad&&y>=-pad&&y<=app.screen.height+pad;
      u.holder.visible=!tiny&&visible;
      u.sprite.visible=!tiny;
      if(u.fearGlow)u.fearGlow.visible=!tiny&&u.scared;
      if(tiny && visible){
        if(!byKind.has(u.type))byKind.set(u.type,new Map());
        const points=byKind.get(u.type),pixel=Math.round(x)+','+Math.round(y);
        if(!points.has(pixel))points.set(pixel,[x,y]);
      }
    }
    function marks(points){for(const [x,y] of points.values())markerLayer.moveTo(x-5,y).lineTo(x+5,y).moveTo(x,y-5).lineTo(x,y+5);}
    if(byKind.size){
      for(const points of byKind.values())marks(points);
      markerLayer.stroke({color:ink['marker-edge'],width:3.2,alpha:.95});
      for(const [type,points] of byKind){marks(points);markerLayer.stroke({color:COLORS[type],width:1.6,alpha:1});}
    }
  }
  function fit() {
    scale = 1; camera.scale.set(1); camera.position.set(0, 0);
    $('zoomLabel').textContent = '100%';
    redraw(); drawVision();
  }

  function visual(type) {
    const holder = new Container(), sprite = T.make(T.codes[type]);

    sprite.width = HEAD; sprite.height = HEAD;
    holder.addChild(sprite);
    return {holder,sprite,fearGlow:null,circle:null,immunity:null};
  }
  function add(type, x, y) {
    const view = visual(type);
    const body = new p2.Body({ mass: 1, position: [x, y], fixedRotation: true, damping: 0 });
    const shape = new p2.Circle({ radius: RADIUS });
    setContactFilter(shape, type);
    // Keep the accepted surface coordinate when p2 adjusts its working vectors.
    body.position = new Float64Array(body.position);
    body.addShape(shape);
    world.addBody(body);
    const angle = Math.random() * TAU;
    const speed = type === 'human' ? wanderSpeed() : type === 'zombie' ? zombieSpeed() : rpsSpeed();
    body.velocity[0] = Math.cos(angle) * speed;
    body.velocity[1] = Math.sin(angle) * speed;
    const u = {
      sequence:nextSequence++,type, body, ...view, angle, scared: false, appearanceId:T.codes[type], facingOffset:T.loaded.get(T.codes[type]).facingDegrees*Math.PI/180,
      heading: angle, wanderHeading: angle, nextWander: t + .5 + Math.random() * 3,
      immuneUntil: 0,
      // Humans start moderately rested. Panic drains energy only while running.
      stamina: staminaStart(), restingUntil: -1, restState: false
    };
    body.agent = u;
    view.holder.position.set(x, y);
    view.holder.rotation = angle + T.loaded.get(T.codes[type]).facingDegrees * Math.PI/180;
    actors.addChild(view.holder);
    units.push(u);resetBrain(u);
    if($('showBounds').checked)outline(u);
    return u;
  }
  function change(u, type) {
    if (u.type === type && (type !== 'human' || !u.scared)) return false;
    forgetContacts(u);u.type = type;
    u.visualState = null;
    setContactFilter(u.body.shapes[0], type);
    u.scared = false;
    u.wanderHeading = u.angle;
    u.nextWander = t + Math.random() * 2;
    u.stamina = staminaStart(); u.restingUntil = -1; u.restState = false;
    resetBrain(u);updateAppearance(u);
    return true;
  }
  function updateAppearance(u) {
    const id = stateOf(u), a = T.loaded.get(id);
    if (!a) return;
    if (u.appearanceId !== id || u.appearanceTheme !== T.id) {
      if (a.textures.length===1 && !u.sprite.play) {
        u.sprite.texture=a.textures[0];u.sprite.anchor.set(...a.pivot);
      } else {
        u.holder.removeChild(u.sprite);u.sprite.destroy();u.sprite=T.make(id);
        u.holder.addChildAt(u.sprite,0);
      }
      u.appearanceId=id;u.appearanceTheme=T.id;
    }
    u.facingOffset=a.facingDegrees*Math.PI/180;
    u.sprite.width=HEAD;u.sprite.height=HEAD;
    if(u.scared && !u.fearGlow){
      u.fearGlow=new Sprite(T.loaded.get('Hs').textures[0]);u.fearGlow.anchor.set(.5);
      u.fearGlow.alpha=.19;u.fearGlow.blendMode='screen';u.holder.addChild(u.fearGlow);
    }
    if(u.fearGlow){u.fearGlow.texture=T.loaded.get('Hs').textures[0];u.fearGlow.width=u.fearGlow.height=HEAD;u.fearGlow.visible=u.scared;}
    outline(u);
  }
  function outline(u){
    const show=$('showBounds').checked;
    if(show && !u.circle){u.circle=new Graphics();u.holder.addChild(u.circle);}
    if(u.circle){u.circle.visible=show;if(show)u.circle.clear().circle(0,0,RADIUS).stroke({color:COLORS[u.type],width:1.4,alpha:.8});}
  }
  const retired=[];
  function disposeRetired(deadline=Infinity){
    while(retired.length && performance.now()<deadline){
      const u=retired.pop();world.removeBody(u.body);u.holder.destroy({children:true});
    }
  }
  function clear(defer=false){
    actors.removeChildren();
    for(const u of units){u.body.agent=null;retired.push(u);}
    units=[];physicalPairs.clear();decisions.clear();dirtyTrees=true;hash.clear();
    sightGraphics.clear();hearingGraphics.clear();markerLayer.clear();
    if(!defer || retired.length<=600)disposeRetired();
  }
  function rescue() {
    const v = arena, pad = RADIUS;
    for (const u of units) {
      const p = u.body.position;
      const x = Math.max(v.left + pad, Math.min(v.right - pad, p[0]));
      const y = Math.max(v.top + pad, Math.min(v.bottom - pad, p[1]));
      if (p[0] !== x || p[1] !== y) {
        teleport(u, x, y); u.immuneUntil = t + immunitySeconds();
      }
    }
  }
  function forgetContacts(u) {
    if(!u.pairKeys)return;
    for(const key of u.pairKeys){
      const pair=physicalPairs.get(key);if(!pair)continue;
      physicalPairs.delete(key);for(const member of pair)member.pairKeys?.delete(key);
    }
    u.pairKeys.clear();
  }
  function teleport(u, x, y) {
    forgetContacts(u);
    const body = u.body;
    body.position[0] = body.previousPosition[0] = x;
    body.position[1] = body.previousPosition[1] = y;
    body.aabbNeedsUpdate=true;u._stepX=x;u._stepY=y;u.revision++;u.target=null;dirtyTrees=true;
    u.holder.position.set(x,y);
  }

  let acceptedHeads = requestedHeads();
  function resizeCreatures() {
    const nextHead = calculatedHead();
    const requested = requestedHeads();
    if (nextHead === HEAD) { acceptedHeads = requested; return; }
    try {
      if (preparing) throw Error('Wait for the round to finish preparing before changing creature size.');
      B.geometry(outer, boundary, wallThickness, nextHead * .44);
    } catch (error) {
      $('headsAcross').value = acceptedHeads;
      $('headsAcrossValue').textContent = acceptedHeads;
      S.setSetting(modeKey('headsAcross'), acceptedHeads, 'game');
      notice(error.message);
      return;
    }
    acceptedHeads = requested;
    HEAD = nextHead; RADIUS = HEAD * .44;
    CATCH = RADIUS * 2 + Math.max(1, HEAD * .05);
    for (const u of units) {
      u.sprite.width=u.sprite.height=HEAD;
      if(u.fearGlow)u.fearGlow.width=u.fearGlow.height=HEAD;
      const shape = u.body.shapes[0];
      shape.radius = RADIUS;
      u.body.updateBoundingRadius(); u.body.updateMassProperties();
      u.body.aabbNeedsUpdate = true;
      outline(u);
      if(u.immunity)u.immunity.clear().circle(0, 0, RADIUS + 3).stroke({ color: ink.immunity, width: 2 });
    }
    if (boundary !== 'none' && arena) rescue();
    index();
    drawVision();
  }

  function centerOnFocus() {
    if (!focusedUnit || !units.includes(focusedUnit)) return;
    const p = focusedUnit.body.position;
    const x = innerWidth / 2 - p[0] * scale;
    const y = innerHeight / 2 - p[1] * scale;
    if (Math.abs(camera.x - x) > .05 || Math.abs(camera.y - y) > .05) {
      camera.position.set(x, y);
      redraw();
      drawVision();
    }
  }
  function setFocus(unit) {
    focusedUnit = unit;
    focusArmed = false;
    const button = $('focusTool');
    button.classList.toggle('active', Boolean(unit));
    button.textContent = unit ? 'Following' : 'Focus';
    button.setAttribute('aria-pressed', String(Boolean(unit)));
    $('unfocus').hidden = !unit;
    $('focusStatus').textContent = unit ? ' · Following ' + (unit.type === 'human' && unit.scared ? 'scared human' : unit.type) : '';
    app.canvas.classList.toggle('focus-pick', focusArmed);
    if (unit) centerOnFocus();
  }
  function armFocus() {
    if (focusArmed) { focusArmed = false; }
    else { setFocus(null); focusArmed = true; }
    $('focusTool').classList.toggle('active', focusArmed || Boolean(focusedUnit));
    $('focusTool').textContent = focusArmed ? 'Pick a face…' : 'Focus';
    $('focusTool').setAttribute('aria-pressed', String(focusArmed));
    app.canvas.classList.toggle('focus-pick', focusArmed);
  }

  function selection() {
    document.querySelectorAll('.overview-item').forEach(el=>el.classList.toggle('selected',el.dataset.kind===chosen));
    document.querySelectorAll('.pick').forEach(b => { b.classList.toggle('active', b.dataset.kind === chosen); b.setAttribute('aria-pressed', String(b.dataset.kind === chosen)); });
    $('prestartPickLabel').textContent = chosen ? 'Your pick: ' + chosen.toUpperCase() : 'Pick a species (optional)';
    document.querySelectorAll('.spawn-option').forEach(b => b.classList.toggle('active', b.dataset.kind === brush));
    if (isZombieMode()) {
      $('pickHint').textContent = !seeded && state !== 'finished'
        ? 'Pick Humans or Zombies before GO (just for fun). No money or prizes.'
        : `Your pick: ${chosen ? chosen.toUpperCase() : 'none'} · locked`;
    } else {
      $('pickHint').textContent = state === 'ready'
        ? 'Choose your pick before GO. No currency or prizes.'
        : `Your pick: ${chosen ? chosen.toUpperCase() : 'none'} · locked for this round`;
    }
  }
  function buildUI() {
    const kinds = active();
    document.body.classList.toggle('is-zombie', isZombieMode());
    $('modeDescription').textContent = isZombieMode()
      ? 'A peaceful crowd… until you infect patient zero.'
      : 'Rock · Paper · Scissors · Lizard · Spock';
    $('populationLabel').textContent = isZombieMode() ? 'Humans · next round' : 'Each · next round';
    $('prestartTitle').textContent = isZombieMode()
      ? 'Click a human to infect & start the outbreak, or press GO to watch them wander.'
      : 'Choose your winner, then start the hunt!';
    $('spawnHint').textContent = isZombieMode()
      ? 'Click a human to infect patient zero. Left-hold to spawn more at the pointer; right-drag to pan. Touch: tap to place, two fingers to pan or spread to zoom in.'
      : 'Left-click to place or convert. Hold to spawn repeatedly at the pointer. Right-drag pan, wheel zoom; on touch, use two fingers to pan / pinch.';
    $('stats').innerHTML = kinds.map(a => `<div class="stat"><span>${a.toUpperCase()}</span><b id="count-${a}" style="color:#${COLORS[a].toString(16).padStart(6,'0')}">0</b></div>`).join('');
    $('bars').innerHTML = kinds.map(a => `<i id="bar-${a}" style="background:#${COLORS[a].toString(16).padStart(6,'0')}"></i>`).join('');
    const pickHTML = kinds.map(a => `<button type="button" class="pick" data-kind="${a}" aria-pressed="false" title="Pick ${a} to win" style="--kind-color:#${COLORS[a].toString(16).padStart(6,'0')}"><img src="${T.icon(a)}" alt="">${a[0].toUpperCase() + a.slice(1)}</button>`).join('');
    $('picks').innerHTML = pickHTML;
    $('prestartPicks').innerHTML = pickHTML;
    V.population(kinds);
    $('overviewBars').innerHTML = kinds.map(a => `<i id="overview-bar-${a}" title="${a}" style="background:#${COLORS[a].toString(16).padStart(6,'0')}"></i>`).join('');
    $('spawns').innerHTML = kinds.map(a => `<button class="spawn-option" data-kind="${a}"><img src="${T.icon(a)}" alt="">${isZombieMode() ? (a === 'zombie' ? 'Seed zombie' : 'Add human') : a[0].toUpperCase() + a.slice(1)}</button>`).join('');
    document.querySelectorAll('.pick').forEach(b => b.onclick = () => {
      if (state !== 'ready' && !(isZombieMode() && !seeded && state !== 'finished')) return;
      chosen = b.dataset.kind; S.setSetting(modeKey('pick'),chosen,'game');
      selection();
    });
    document.querySelectorAll('.spawn-option').forEach(b => b.onclick = () => {
      brush = brush === b.dataset.kind ? null : b.dataset.kind;
      S.setSetting(modeKey('brush'),brush,'game');selection();
    });
    V.syncHUD(mode);selection(); V.renderRulesDiagram(mode,mode==='3'?RPS3:RPS5); update(true);
  }
  function setState(next) {
    state = next;
    $('run').textContent = next === 'ready' ? 'GO' : next === 'running' ? 'Pause' : next === 'paused' ? 'Resume' : 'Finished';
    $('run').disabled = next === 'finished';
    $('prestart').classList.toggle('hidden', next !== 'ready');
    selection(); update(true);
  }
  function update(force = false) {
    if (!force && t - lastUI < .12) return;
    lastUI = t;
    const numbers = Object.fromEntries(active().map(a => [a, 0]));
    let scared=0,soonest=Infinity;const states={H:0,Hs:0,Hi:0,Zi:0,Zh:0,Zc:0,Za:0};
    for (const u of units) { numbers[u.type]++;if(isZombieMode()){states[u.aiState]++;if(u.incubation!==null)soonest=Math.min(soonest,u.incubation);}
      if (u.type === 'human' && u.scared) scared++; }
    for (const a of active()) {
      $('count-' + a).textContent = numbers[a];
      $('bar-' + a).style.width = (units.length ? 100 * numbers[a] / units.length : 0) + '%';
    }
    V.updatePopulation(numbers,chosen);if(isZombieMode()){V.setStateCounts(states);$('stateTimers').textContent=Number.isFinite(soonest)?'Next transformation in '+(soonest/1000).toFixed(1)+' s':'';}
    $('total').textContent = isZombieMode()
      ? `${numbers.human} humans · ${scared} panicked · ${numbers.zombie} zombies`
      : units.length + ' creatures';
    $('status').textContent = state === 'ready' ? 'Ready to start' : state === 'running'
      ? (isZombieMode() ? (seeded ? 'Outbreak spreading' : 'Peaceful wandering') : 'Hunting…')
      : state === 'paused' ? 'Paused' : 'Finished';
    if (isZombieMode()) {
      const left = outbreakAt === null ? null : Math.max(0, survivalSeconds() - (t - outbreakAt));
      const resting = units.reduce((sum,u) => sum + Number(u.type === 'human' && u.restState),0);
      $('outbreakStatus').textContent = outbreakAt === null
        ? 'All calm · waiting for patient zero'
        : `Outbreak active · ${resting} humans resting · ${unlimitedOutbreak() ? 'No time limit' : `survive ${Math.ceil(left)} more seconds`}`;
    }
  }
  let generation=0, preparing=false, roundSeed='', lastBuildMs=0;
  function notice(text) {$('roundNotice').textContent=text;$('roundNotice').hidden=!text;}
  function reset() {
    const ticket=++generation, started=performance.now();
    preparing=false;setFocus(null);clear(true);nextSequence=0;
    t=0;accumulator=0;stepNumber=0;lastUI=-1;lastVisionDraw=0;
    mode=$('mode').value;chosen=get(modeKey('pick'));brush=get(modeKey('brush'));
    refreshConfig();boundary=$('boundaryMode').value;
    seeded=false;outbreakAt=null;$('result').classList.remove('show');
    const count=Math.min(maxCreatures,Math.max(1,Math.floor(Number($('population').value))||1));
    const counts=isZombieMode()?{human:count,zombie:get(modeKey('initialZombies'))}:Object.fromEntries(active().map(kind=>{const n=get(modeKey('count.'+kind));return [kind,n<0?count:n];}));
    const extent=config.arenaScale*(isZombieMode()?Number($('spawnExtent').value):1);
    const width=innerWidth*extent,height=innerHeight*extent;
    const left=(innerWidth-width)/2,top=(innerHeight-height)/2;
    outer=B.rectangle(left,top,left+width,top+height);
    wallThickness=Number($('wallWidth').value);
    arena=null;
    roundSeed=get(modeKey('seedMode'))==='fixed'?get(modeKey('seed')):crypto.getRandomValues(new Uint32Array(2)).join('-');
    buildUI();
    let places;
    try{
      arena=B.geometry(outer,boundary,wallThickness,RADIUS);
      redraw();
      const total=Object.values(counts).reduce((a,b)=>a+b,0);
      if(!total)throw Error('Choose at least one creature for the next round.');
      if(total>maxCreatures)throw Error('Round limit is '+maxCreatures+' creatures. Reduce the requested population.');
      places=SwarmSimulation.placements({seed:roundSeed,bounds:arena,counts,radius:RADIUS,gap:config.gap,distribution:get(modeKey('distribution'))});
    }catch(e){
      redraw();
      setState('ready');$('run').disabled=$('startBig').disabled=true;notice(e.message);
      function finishCleanup(){if(ticket!==generation)return;disposeRetired(performance.now()+7);if(retired.length)requestAnimationFrame(finishCleanup);}
      finishCleanup();return;
    }
    preparing=true;setState('ready');$('run').disabled=$('startBig').disabled=true;
    let cursor=0;
    function batch(){
      if(ticket!==generation)return;
      const stop=performance.now()+7;disposeRetired(stop);
      if(retired.length){notice('Clearing previous round · '+retired.length);requestAnimationFrame(batch);return;}
      do {const q=places[cursor++];add(q.type,q.x,q.y);}
      while(cursor<places.length && (places.length<=600 || performance.now()<stop));
      if(cursor<places.length){notice('Preparing '+cursor+' / '+places.length);requestAnimationFrame(batch);return;}
      preparing=false;notice('');$('startBig').disabled=false;
      if(counts.zombie>0){seeded=true;outbreakAt=0;}
      setState(isZombieMode()?'running':'ready');update(true);drawVision();drawCrosshairs();
      lastBuildMs=performance.now()-started;
    }
    batch();
  }
  function startOutbreak() {
    if (!isZombieMode() || seeded === true) return;
    seeded = true; outbreakAt = t;
    if (state === 'ready') setState('running');
    selection(); update(true);
  }
  function winner(type) {
    if (state === 'finished') return;
    setState('finished');
    const actual = type || units[0]?.type;
    $('resultIcon').src = T.icon(actual);
    $('resultTitle').textContent = isZombieMode()
      ? actual === 'human' ? 'HUMANS SURVIVED!' : 'ZOMBIES TAKE OVER!'
      : actual.toUpperCase() + ' WINS!';
    $('resultTitle').style.color = '#' + COLORS[actual].toString(16).padStart(6,'0');
    const count = units.filter(u => u.type === actual).length;
    $('resultDetails').textContent = `${count} ${actual === 'human' ? 'human survivors' : 'survivors'} · ${Math.round(t)}s · ${isZombieMode() ? 'Outbreak' : mode === '3' ? 'Classic' : 'Lizard–Spock'} mode`;
    $('pickResult').dataset.won=String(chosen===actual);
    $('pickResult').textContent = chosen
      ? (chosen === actual ? 'YOUR PICK WON!' : `Your pick: ${chosen.toUpperCase()} · Better luck next round`)
      : 'No prediction selected this round';
    $('pickResult').style.color = chosen === actual ? ink.win : ink.loss;
    $('result').classList.add('show');
    update(true);
  }
  function testWinner() {
    if (state === 'finished' || !units.length) return;
    if (isZombieMode()) {
      if (!seeded) return; // No automatic victory before patient zero.
      let humans = 0, zombies = 0;
      for (const u of units) if (u.type === 'zombie') zombies++; else humans++;
      if (!humans) winner('zombie');
      else if (!zombies) winner('human');
      else if (!unlimitedOutbreak() && outbreakAt !== null && t - outbreakAt >= survivalSeconds()) winner('human');
      return;
    }
    if(units.every(u=>u.type===units[0].type))winner(units[0].type);
  }

  let decisions=new Map(), dirtyTrees=true, nextSequence=0;
  const B = SwarmBoundary;
  let outer = B.rectangle(0, 0, innerWidth, innerHeight);
  let arena = outer, wallThickness = 1;

  function updateBoundary() {
    const modeValue = $('boundaryMode').value;
    const thickness = Number($('wallWidth').value);
    try {
      if (preparing && (modeValue !== boundary || thickness !== wallThickness))
        throw Error('Wait for the round to finish preparing before changing its boundary.');
      const next = B.geometry(outer, modeValue, thickness, RADIUS);
      const changed = modeValue !== boundary || thickness !== wallThickness;
      boundary = modeValue;
      wallThickness = thickness;
      arena = next;
      if (changed) {
        if (boundary !== 'none') rescue();
        dirtyTrees = true;
        index();
        drawVision();
        drawCrosshairs();
        notice('');
      }
    } catch (error) {
      $('boundaryMode').value = boundary;
      $('wallWidth').value = wallThickness;
      S.setSetting(modeKey('boundaryMode'), boundary, 'game');
      S.setSetting(modeKey('wallWidth'), wallThickness, 'game');
      notice(error.message);
    }
    V.syncHUD(mode);
    redraw();
  }
  let config={}, senses={}, kindRules={};
  function refreshConfig() {
    config={};
    for(const items of Object.values(SwarmOptions))for(const [key] of items){
      if(S.schema.has(modeKey(key)))config[key]=get(modeKey(key));
    }
    if(isZombieMode())for(const k of ['idleInterrupt','spreadFear'])config[k]=get(modeKey(k));
    for(const kind of active()) {
      senses[kind]=Object.fromEntries(['enabled','fov','angle','sight','hearing'].map(k=>[k,get(modeKey('ai.'+kind+'.'+k))]));
      kindRules[kind]=isZombieMode()?{prey:kind==='zombie'?['human']:[],threat:kind==='human'?['zombie']:[]}:
        {prey:active().filter(q=>beats(kind,q)),threat:active().filter(q=>beats(q,kind))};
    }
  }
  function displacement(u,other) {
    let dx=other.body.position[0]-u.body.position[0],dy=other.body.position[1]-u.body.position[1];
    if(boundary==='wrap'){
      dx-=Math.round(dx/arena.width)*arena.width;dy-=Math.round(dy/arena.height)*arena.height;
    }
    return [dx,dy];
  }
  function detect(u,dx,dy) {return SwarmSimulation.canDetect(senses[u.type],dx,dy,u.angle,HEAD);}
  function findTarget(u,types,radius,accept=()=>true) {
    const sensor=senses[u.type];
    const range=sensor.fov?Math.min(radius,HEAD*Math.max(sensor.sight,sensor.hearing)):radius;
    return SwarmSimulation.nearest(decisions,types,u,range,(q,dx,dy)=>accept(q) && detect(u,dx,dy),
      boundary==='wrap'?arena:null);
  }
  function rollTime(a,b){return (Math.min(a,b)+Math.random()*Math.abs(b-a))/1000;}
  function wander(u){
    if(t>=u.nextWander){
      u.wanderHeading=u.angle+(Math.random()-.5)*Math.PI;
      u.nextWander=t+rollTime(config.wanderMin,config.wanderMax);
    }
    return u.wanderHeading;
  }
  function assignState(u,id) {
    if(u.aiState===id)return;
    u.aiState=id;
    if(isZombieMode()){
      u.visualState=id;u.scared=id==='Hs';
      updateAppearance(u);
    }
  }
  function resetBrain(u) {
    u.target=null;u.danger=null;u.targetVersion=-1;u.revision=(u.revision||0)+1;
    u.fearUntil=0;u.directFearUntil=0;u.scared=false;u.exposure=0;u.incubation=null;u.bonusContact=0;
    u.attackUntil=0;u.trackedAt=t;u.lockUntil=0;u.searchUntil=0;
    u.idleUntil=t+(isZombieMode()?rollTime(config.idleMin,config.idleMax):0);
    u.nextWander=t+rollTime(config.wanderMin,config.wanderMax);
    assignState(u,u.type==='human'?'H':u.type==='zombie'?'Zi':'wander');
    dirtyTrees=true;
  }
  function eligible(u,q) {
    return !!q && q.body.agent===q && kindRules[u.type].prey.includes(q.type) && q.incubation===null;
  }
  function decide(u){
    if(!senses[u.type].enabled){u.target=u.danger=null;return;}
    const outbreak=isZombieMode();
    u.danger=findTarget(u,kindRules[u.type].threat,u.type==='human'?Infinity:config.threat*HEAD);
    if(u.type==='human'){
      if(u.incubation!==null)return;
      if(u.danger){
        const [dx,dy]=displacement(u,u.danger);
        u.heading=Math.atan2(-dy,-dx);u.fearUntil=t+config.fearDuration/1000;u.directFearUntil=u.fearUntil;
      } else if(config.spreadFear && config.panicRange>0) {
        const runner=findTarget(u,['human'],config.panicRange*HEAD,q=>q.directFearUntil>t && q.aiState==='Hs');
        if(runner){u.heading=runner.heading;u.fearUntil=t+config.fearDuration/1000;}
      }
      return;
    }
    if(u.type==='zombie' && t<u.idleUntil && !config.idleInterrupt && senses.zombie.fov){u.target=null;return;}
    const old=u.target;
    let valid=eligible(u,old) && old.revision===u.targetVersion;
    const oldDelta=valid?displacement(u,old):null;
    valid=valid && detect(u,...oldDelta);
    if(!valid || t>=u.lockUntil){
      const nearest=findTarget(u,kindRules[u.type].prey,Infinity,q=>q.incubation===null);
      if(!valid)u.target=nearest;
      else if(nearest && nearest!==old && Math.hypot(...displacement(u,nearest))<Math.hypot(...oldDelta)*(1-config.retarget/100))u.target=nearest;
    }
    if(u.target && (u.target!==old || !valid)){
      u.targetVersion=u.target.revision;u.trackedAt=t;
      const [lo,hi]=outbreak?fixationLimits():[0,0];u.lockUntil=t+lo+Math.random()*(hi-lo);
    }
    if(u.target){u.searchUntil=t+(config.huntTime||0)/1000;u.idleUntil=0;}
  }
  function steer(u,angle,speed,dt) {
    const p=u.body.position;
    let dx=Math.cos(angle),dy=Math.sin(angle);
    if(boundary==='walls'){
      const pad=RADIUS+Math.max(1,speed*dt);
      if((p[0]<=arena.left+pad && dx<0)||(p[0]>=arena.right-pad && dx>0))dx=0;
      if((p[1]<=arena.top+pad && dy<0)||(p[1]>=arena.bottom-pad && dy>0))dy=0;
      if(Math.abs(dx)+Math.abs(dy)<.001) {dx=(arena.left+arena.right)/2-p[0];dy=(arena.top+arena.bottom)/2-p[1];}
    }
    const goal=Math.atan2(dy,dx),delta=Math.atan2(Math.sin(goal-u.angle),Math.cos(goal-u.angle));
    const limit=config.turnRate*Math.PI/180*dt;
    u.angle+=Math.max(-limit,Math.min(limit,delta));
    u.body.velocity[0]=Math.cos(u.angle)*speed;u.body.velocity[1]=Math.sin(u.angle)*speed;
  }
  function scaredSpeed(u,dt) {
    if(u.restState && t<u.restingUntil)return 0;
    if(u.restState){u.restState=false;u.stamina=100;}
    u.stamina=Math.max(0,u.stamina-dt*rates.drain);
    if(u.stamina<=0){u.restState=true;u.restingUntil=t+rates.rest;return 0;}
    return rates.flee*(rates.minimum+(1-rates.minimum)*u.stamina/100);
  }
  let rates={}, boundary='walls';
  function movement(dt) {
    const interval=aiInterval();
    if(dirtyTrees || (stepNumber-1)%interval===0){decisions=SwarmSimulation.trees(units);dirtyTrees=false;}
    rates={rps:rpsSpeed(),wander:wanderSpeed(),flee:fleeSpeed(),zombie:zombieSpeed(),
      boostRange:zombieBoostDistance(),boost:zombieBoostFactor(),minimum:staminaMinSpeed(),drain:staminaDrain(),rest:staminaRest()};
    for(const u of units){
      const invalid=u.target && (!eligible(u,u.target)||u.target.revision!==u.targetVersion);
      if(invalid||u.sequence%interval===(stepNumber-1)%interval)decide(u);
      let angle=u.angle,speed=rates.rps;
      if(!senses[u.type].enabled){
        u.target=u.danger=null;speed=0;
        assignState(u,u.type==='zombie'?'Zi':u.type==='human'?(u.incubation===null?'H':'Hi'):'idle');
      } else if(u.type==='human'){
        const scared=!!u.danger || t<u.fearUntil;
        assignState(u,u.incubation!==null?'Hi':scared?'Hs':'H');
        angle=scared?u.heading:wander(u);speed=scared?scaredSpeed(u,dt):rates.wander;
        if(!scared){u.stamina=Math.min(100,u.stamina+dt*rates.drain*.35);if(t>=u.restingUntil)u.restState=false;}
      } else if(u.type==='zombie'){
        if(u.target){
          const [dx,dy]=displacement(u,u.target);angle=Math.atan2(dy,dx);
          speed=rates.zombie*(Math.hypot(dx,dy)<=rates.boostRange?rates.boost:1);
          assignState(u,t<u.attackUntil?'Za':t-u.trackedAt>=config.acquire/1000?'Zc':'Zh');
        } else if(t<u.attackUntil){assignState(u,'Za');speed=0;}
        else if(t<u.idleUntil){assignState(u,'Zi');speed=0;}
        else {
          if(!u.searchUntil)u.searchUntil=t+config.huntTime/1000;
          if(t>=u.searchUntil){u.idleUntil=t+rollTime(config.idleMin,config.idleMax);u.searchUntil=0;}
          assignState(u,u.idleUntil>t?'Zi':'Zh');angle=wander(u);speed=u.aiState==='Zi'?0:rates.zombie*.55;
        }
      } else {
        const danger=u.danger && kindRules[u.type].threat.includes(u.danger.type) &&
          Math.hypot(...displacement(u,u.danger))<=config.threat*HEAD ? u.danger:null;
        const other=danger||u.target;
        if(other){const [dx,dy]=displacement(u,other);angle=Math.atan2(dy,dx)+(danger?Math.PI:0);}
        else angle=wander(u);
        assignState(u,danger?'flee':u.target?'pursue':'wander');
      }
      steer(u,angle,speed,dt);
    }
  }
  function boundsAndRender() {
    const v = arena;
    for (const u of units) {
      const p = u.body.position, velocity = u.body.velocity;
      u.sweep = null;
      if (boundary !== 'none' && (p[0] < v.left+RADIUS || p[0] > v.right-RADIUS ||
          p[1] < v.top+RADIUS || p[1] > v.bottom-RADIUS)) {
        u.sweep = B.segments(u._stepX, u._stepY, p[0], p[1], v, RADIUS, boundary);
        // A wrapped endpoint can be an additional diameter from the
        // entry point on each axis when measured through the torus.
        const portalGap = boundary === 'wrap' ? Math.SQRT2 * 2 * RADIUS : 0;
        u.sweepRange = Math.hypot(p[0]-u._stepX, p[1]-u._stepY) + portalGap;
      }
      if (B.constrain(p, velocity, v, RADIUS, boundary)) {
        teleport(u, p[0], p[1]);
      }
      u.body.aabbNeedsUpdate = true;
      u.holder.position.set(p[0], p[1]);
      const target = u.angle + u.facingOffset;
      const delta = Math.atan2(Math.sin(target - u.holder.rotation), Math.cos(target - u.holder.rotation));
      u.holder.rotation += delta * .23;
      if(t<u.immuneUntil && !u.immunity){u.immunity=new Graphics().circle(0,0,RADIUS+3).stroke({color:ink.immunity,width:2});u.holder.addChild(u.immunity);}
      if(u.immunity)u.immunity.visible=t<u.immuneUntil;
    }
  }
  function collisionConversions(dt) {
    index();
    const used=new Set(),changes=[], bites=new Map();
    const travel = u => u.sweep ? u.sweepRange : Math.hypot(u.body.position[0]-u._stepX,u.body.position[1]-u._stepY);
    const path = u => u.sweep || [{from:0, until:1, x:u._stepX, y:u._stepY,
      vx:u.body.position[0]-u._stepX, vy:u.body.position[1]-u._stepY}];
    let maxTravel=0;
    for(const u of units) maxTravel=Math.max(maxTravel,travel(u));
    function interact(a,b,lo,hi) {
      if(used.has(a)||used.has(b))return;
      if(isZombieMode()){
        const h=a.type==='human'?a:b,z=a.type==='zombie'?a:b;
        if(h.immuneUntil>t || !senses.zombie.enabled)return;
        const list=bites.get(h)||[];list.push([lo,hi]);bites.set(h,list);
        z.attackUntil=t+config.attackHold/1000;assignState(z,'Za');
      } else {
        const winner=beats(a.type,b.type)?a:beats(b.type,a.type)?b:null;
        if(!winner)return;
        const loser=winner===a?b:a;
        if(t<loser.immuneUntil)return;
        changes.push([loser,winner.type]);used.add(a);used.add(b);
      }
    }
    function consider(a,b,physical=false){
      if(!a||!b||a===b||a.type===b.type||used.has(a)||used.has(b))return;
      if (!physical && (a.sweep || b.sweep)) {
        B.contactSpans(path(a), path(b), CATCH, boundary==='wrap'?arena:null,
          (lo,hi)=>interact(a,b,lo,hi));
        return;
      }
      let dx=a._stepX-b._stepX,dy=a._stepY-b._stepY;
      if(boundary==='wrap'){dx-=Math.round(dx/arena.width)*arena.width;dy-=Math.round(dy/arena.height)*arena.height;}
      const vx=a.body.position[0]-a._stepX-b.body.position[0]+b._stepX;
      const vy=a.body.position[1]-a._stepY-b.body.position[1]+b._stepY;
      const aa=vx*vx+vy*vy,bb=dx*vx+dy*vy,cc=dx*dx+dy*dy-CATCH*CATCH;
      let lo=0,hi=1;
      if(!physical){
        if(aa<1e-12){if(cc>0)return;}
        else {
          const disc=bb*bb-aa*cc;if(disc<0)return;
          const root=Math.sqrt(disc);lo=Math.max(0,(-bb-root)/aa);hi=Math.min(1,(-bb+root)/aa);
          if(lo>hi)return;
        }
      }
      interact(a,b,lo,hi);
    }
    for(const [a,b] of physicalPairs.values())consider(a,b,true);
    for(const a of units){
      if(used.has(a) || (isZombieMode()&&a.type==='human'))continue;
      const range=CATCH+travel(a)+maxTravel;
      const [x,y]=a.body.position;
      const scan=(cx,cy)=>query(cx,cy,range,b=>{if(isZombieMode()||a.sequence<b.sequence)consider(a,b);});
      scan(x,y);
      if(boundary==='wrap'){
        const xs=[0],ys=[0];
        if(x-arena.left<range)xs.push(arena.width);if(arena.right-x<range)xs.push(-arena.width);
        if(y-arena.top<range)ys.push(arena.height);if(arena.bottom-y<range)ys.push(-arena.height);
        for(const ox of xs)for(const oy of ys)if(ox||oy)scan(x+ox,y+oy);
      }
    }
    if(isZombieMode())for(const h of units){
      if(h.type!=='human')continue;
      const spans=bites.get(h);
      if(!spans && h.incubation===null)continue;
      let cursor=0,result='human';
      const advance=(fraction,touching)=>{
        if(fraction<=0||result==='convert')return;
        const ms=fraction*dt*1000;result=SwarmSimulation.exposure(h,ms,touching?ms:0,config);
      };
      for(const [lo,hi] of (spans||[]).sort((a,b)=>a[0]-b[0])){
        advance(lo-cursor,false);advance(hi-Math.max(lo,cursor),true);cursor=Math.max(cursor,hi);
      }
      advance(1-cursor,false);
      if(result==='convert')changes.push([h,'zombie']);
      else if(h.incubation!==null)assignState(h,'Hi');
    }
    for(const [u,type] of changes)change(u,type);
  }
  function drawVision() {
    sightGraphics.clear(); hearingGraphics.clear();
    const showSight = $('showFov').checked, showHearing = $('showHearing').checked;
    if (!showSight && !showHearing) return;
    const view=visibleWorld();
    for (const u of units) {
      const p = u.body.position;
      const sen=senses[u.type];if(!sen?.fov)continue;
      const distance=sen.sight*HEAD,radius=sen.hearing*HEAD,half=sen.angle*Math.PI/360,padding=Math.max(distance,radius);
      if (p[0] < view.left-padding || p[0] > view.right+padding ||
          p[1] < view.top-padding || p[1] > view.bottom+padding) continue;
      const color = u.type === 'zombie' ? ink['vision-zombie'] : u.scared ? ink['vision-scared'] : ink['vision-human'];
      if (showSight) {
        // A pizza-slice wedge. Its pointed tip is the actor's position;
        // the curved outer edge is the maximum sight distance.
        sightGraphics.moveTo(p[0], p[1])
          .arc(p[0], p[1], distance, u.angle - half, u.angle + half)
          .lineTo(p[0], p[1])
          .fill({ color, alpha: .085 });
      }
      if (showHearing)
        hearingGraphics.circle(p[0], p[1], radius).stroke({ color, alpha: .14, width: 1 });
    }
  }

  const profile={steps:0,ai:0,physics:0,contacts:0,renderSync:0};
  let impulse=null,profiling=false;
  function step(dt) {
    stepNumber++;
    const start=profiling?performance.now():0;
    movement(dt);
    if(impulse){units[0].body.velocity[0]=impulse[0];units[1].body.velocity[0]=impulse[1];impulse=null;}
    const brainEnd=profiling?performance.now():0;
    for(const u of units){u._stepX=u.body.position[0];u._stepY=u.body.position[1];}
    world.step(dt);
    const physicsEnd=profiling?performance.now():0;
    boundsAndRender();
    const renderEnd=profiling?performance.now():0;
    collisionConversions(dt);testWinner();
    if(profiling){profile.steps++;profile.ai+=brainEnd-start;profile.physics+=physicsEnd-brainEnd;profile.renderSync+=renderEnd-physicsEnd;profile.contacts+=performance.now()-renderEnd;}
  }
  // === INPUT: one coordinate system for mouse, touch, and focus selection ===
  // Convert browser CLIENT coordinates through the canvas's visible CSS rect
  // to renderer screen pixels. Never use pageX, offsetX, or devicePixelRatio
  // directly, since those are different coordinate systems when zoomed.
  function screenPoint(clientX, clientY) {
    const rect = app.canvas.getBoundingClientRect();
    const w = app.screen.width, h = app.screen.height;
    return {
      x: (clientX - rect.left) * w / Math.max(1, rect.width),
      y: (clientY - rect.top) * h / Math.max(1, rect.height)
    };
  }
  function pointerWorld(point) {
    const at = screenPoint(point.clientX, point.clientY);
    return { x: (at.x - camera.x) / scale, y: (at.y - camera.y) / scale };
  }
  function nearestAt(point) {
    index();
    const at = pointerWorld(point);
    // A small screen-space hit tolerance keeps very small sprites selectable.
    const hitRadius = Math.max(RADIUS, 11 / scale);
    let closest = null, bestD2 = hitRadius ** 2;
    query(at.x, at.y, hitRadius, u => {
      const dx = at.x - u.body.position[0], dy = at.y - u.body.position[1];
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; closest = u; }
    });
    return { closest, at };
  }
  let lastInputWorld = null;
  function paint(point, spray = false) {
    const { closest, at } = nearestAt(point);
    lastInputWorld = at;
    if (focusArmed) {
      if (closest) setFocus(closest);
      return;
    }
    if (!arena || !brush || preparing || retired.length) return;
    if(Math.max(Math.abs(at.x),Math.abs(at.y))>RADIUS*2**21){notice('Outside the precision range for placement.');return;}
    if(boundary!=='none' && (!closest||spray) && (at.x<arena.left || at.x>arena.right || at.y<arena.top || at.y>arena.bottom)){
      notice('Place creatures inside the arena.');return;
    }
    const place=(x,y)=>{
      if(boundary!=='none'){
        x=Math.max(arena.left+RADIUS,Math.min(arena.right-RADIUS,x));y=Math.max(arena.top+RADIUS,Math.min(arena.bottom-RADIUS,y));
      }
      add(brush,x,y);
    };
    const now = performance.now();
    if (spray && now - lastPaint < Number($('spawnRate').value)) return;
    lastPaint = now;
    if (spray) {
      const burst = Math.max(1, Math.min(250, Number($('spawnBurst').value) || 1));
      const spread = Number($('spawnSpread').value) * HEAD;
      for (let i = 0; i < burst && units.length < maxCreatures; i++) {
        const angle = Math.random() * TAU;
        // A hyper-fast brush must not put hundreds of physics circles at the
        // identical spot: gently scatter around the exact cursor center.
        const radius = Math.sqrt(Math.random()) * Math.max(spread, burst > 1 ? HEAD * .55 : 0);
        place(at.x+Math.cos(angle)*radius,at.y+Math.sin(angle)*radius);
      }
      if (isZombieMode() && brush === 'zombie') startOutbreak();
    } else if (closest) {
      const infection = isZombieMode() && closest.type === 'human' && brush === 'zombie';
      change(closest, brush);
      if (infection) startOutbreak();
    } else {
      // Exactly at the cursor, in world space. No spawn jitter on a tap.
      if(units.length<maxCreatures)place(at.x,at.y);
      if (isZombieMode() && brush === 'zombie') startOutbreak();
    }
    if (state === 'finished') { $('result').classList.remove('show'); setState('paused'); }
    update(true); drawVision();
  }
  // p2 stores positions in Float32. Keep a viewport span below 2^21 radii
  // so world-point placement retains several representable increments per radius.
  const safeMinZoom=()=>Math.max(MIN_ZOOM,Math.max(innerWidth,innerHeight)/(2**21*RADIUS));
  const clampZoom=value=>Math.min(MAX_ZOOM,Math.max(safeMinZoom(),value));
  function pinchStart(pair){
    if(!pair)return null;
    const at=screenPoint(pair.x,pair.y);
    return {distance:pair.distance,zoom:scale,wx:(at.x-camera.x)/scale,wy:(at.y-camera.y)/scale};
  }
  function pinchMove(start,pair){
    if(!start||!pair)return;
    const at=screenPoint(pair.x,pair.y);
    scale=clampZoom(start.zoom*pair.distance/start.distance);
    camera.scale.set(scale);camera.position.set(at.x-start.wx*scale,at.y-start.wy*scale);
    $('zoomLabel').textContent=Number((scale*100).toPrecision(4))+'%';
    redraw();drawVision();saveCamera();
  }
  function setScaleAt(clientX, clientY, multiplier) {
    // Zoom about the pointer; keep the world point at the same screen point.
    const at = screenPoint(clientX, clientY);
    const wx = (at.x - camera.x) / scale, wy = (at.y - camera.y) / scale;
    const nextScale = clampZoom(scale*multiplier);
    scale = nextScale;
    camera.scale.set(scale);
    camera.position.set(at.x - wx * scale, at.y - wy * scale);
    $('zoomLabel').textContent = (scale*100>=1?(scale*100).toFixed(0):(scale*100).toPrecision(2)) + '%';
    redraw(); drawVision(); saveCamera();
  }
  function cameraPan(cssDX, cssDY) {
    const rect = app.canvas.getBoundingClientRect();
    camera.x += cssDX * app.screen.width / Math.max(1, rect.width);
    camera.y += cssDY * app.screen.height / Math.max(1, rect.height);
    redraw(); drawVision(); saveCamera();
  }

  // Touch events are the primary mobile input path. This works on mobile
  // Safari, Chrome Android, and touchscreen browsers where pointer capture
  // doesn't reliably provide two simultaneous touch pointers.
  // PointerEvents are reserved for mouse/pen below to avoid double input.
  const fingerPositions = new Map();
  let touchSession = null;
  const tapMovement = 13;
  function fingerPair() {
    const list = Array.from(fingerPositions.values());
    if (list.length < 2) return null;
    const a = list[0], b = list[1];
    return {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))
    };
  }
  function refreshFingers(event) {
    fingerPositions.clear();
    for (const finger of Array.from(event.touches))
      fingerPositions.set(finger.identifier, { x: finger.clientX, y: finger.clientY });
  }
  function onTouchStart(event) {
    lastNativeTouch=performance.now();
    event.preventDefault();
    refreshFingers(event);
    const first = Array.from(fingerPositions.values())[0];
    if (!touchSession) {
      touchSession = {
        gesture: false, moved: false, held: false,
        startedAt: performance.now(), lastPoint: first,
        startPoint: first, pair: null
      };
    }
    if (fingerPositions.size >= 2) {
      touchSession.gesture = true;
      touchSession.pair = pinchStart(fingerPair());
      if (focusedUnit) setFocus(null);
    }
  }
  function onTouchMove(event) {
    lastNativeTouch=performance.now();
    event.preventDefault();
    refreshFingers(event);
    if (!touchSession) return;
    if (fingerPositions.size >= 2) {
      touchSession.gesture = true;
      const pair = fingerPair();
      pinchMove(touchSession.pair,pair);
      return;
    }
    touchSession.pair = null;
    if (fingerPositions.size === 1) {
      touchSession.lastPoint = Array.from(fingerPositions.values())[0];
      if (Math.hypot(touchSession.lastPoint.x - touchSession.startPoint.x,
                     touchSession.lastPoint.y - touchSession.startPoint.y) > tapMovement)
        touchSession.moved = true;
    }
  }
  function onTouchEnd(event) {
    lastNativeTouch=performance.now();
    event.preventDefault();
    const original = touchSession;
    refreshFingers(event);
    if (!original) return;
    if (fingerPositions.size >= 2) { original.pair = pinchStart(fingerPair()); return; }
    if (fingerPositions.size === 1) {
      // Don't spawn when a two-finger gesture finishes one finger early.
      original.pair = null;
      if (original.gesture) return;
      original.lastPoint = Array.from(fingerPositions.values())[0];
      return;
    }
    touchSession = null;
    if(original.gesture){S.flush();return;}
    if(original.held||original.moved)return;
    const end = event.changedTouches[0];
    if (end) { lastPaint = -Infinity; paint({ clientX: end.clientX, clientY: end.clientY }); }
  }
  function onTouchCancel(event) {
    lastNativeTouch=performance.now();
    event.preventDefault();
    refreshFingers(event);
    if (!fingerPositions.size) touchSession=null;
    else if(touchSession){touchSession.gesture=true;touchSession.pair=pinchStart(fingerPair());}
    S.flush();
  }
  for (const [kind, callback] of [
    ['touchstart', onTouchStart], ['touchmove', onTouchMove],
    ['touchend', onTouchEnd], ['touchcancel', onTouchCancel]
  ]) app.canvas.addEventListener(kind, callback, { passive: false });

  // Pointer-touch fallback for touchscreens that expose PointerEvents but
  // don't dispatch TouchEvents. Native touch gestures take precedence; the
  // pointer route never paints until pointerup, so touchstart can suppress it
  // without a duplicate spawn.
  const pointerFingers = new Map();
  let pointerSession = null, lastNativeTouch = -Infinity;
  function pointerPair() {
    const list = [...pointerFingers.values()];
    if (list.length < 2) return null;
    const a = list[0], b = list[1];
    return { x: (a.x+b.x)/2, y:(a.y+b.y)/2,
      distance: Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)) };
  }
  function touchPointerDown(event) {
    pointerFingers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if (!pointerSession) pointerSession={gesture:false,moved:false,held:false,
      startedAt:performance.now(),startPoint:{x:event.clientX,y:event.clientY},
      lastPoint:{x:event.clientX,y:event.clientY},pair:null};
    if (pointerFingers.size>=2) {pointerSession.gesture=true;
      pointerSession.pair=pinchStart(pointerPair());if(focusedUnit)setFocus(null);}
  }
  function touchPointerMove(event) {
    if (!pointerFingers.has(event.pointerId)) return;
    pointerFingers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if (!pointerSession || touchSession || performance.now()-lastNativeTouch<1000) return;
    if (pointerFingers.size>=2) {
      pointerSession.gesture=true;
      pinchMove(pointerSession.pair,pointerPair());
    } else {
      pointerSession.lastPoint={x:event.clientX,y:event.clientY};
      const p=pointerSession.lastPoint,q=pointerSession.startPoint;
      if(Math.hypot(p.x-q.x,p.y-q.y)>tapMovement)pointerSession.moved=true;
    }
  }
  function touchPointerEnd(event) {
    const existing=pointerFingers.has(event.pointerId);
    pointerFingers.delete(event.pointerId);
    if(!existing || !pointerSession)return;
    const session=pointerSession;
    if(pointerFingers.size) {session.pair=pinchStart(pointerPair());return;}
    pointerSession=null;if(session.gesture)S.flush();
    if(touchSession || performance.now()-lastNativeTouch<1000)return;
    if(!session.gesture && !session.held && !session.moved && event.type==='pointerup') {
      lastPaint=-Infinity;
      paint({clientX:event.clientX,clientY:event.clientY});
    }
  }

  // Mouse/pen path: left clicks paint, right drags pan. No left-drag pan.
  app.canvas.addEventListener('contextmenu', event => event.preventDefault());
  app.canvas.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch') {touchPointerDown(event);return;}
    if (event.button === 2) {
      if (focusedUnit) setFocus(null);
      rightDown = true;
      lastPointer = { x: event.clientX, y: event.clientY };
      app.canvas.setPointerCapture?.(event.pointerId);
    } else if (event.button === 0) {
      leftDown = true;
      lastPaint = -Infinity;
      leftDownAt = performance.now();
      lastLeftPoint = { clientX: event.clientX, clientY: event.clientY };
      app.canvas.setPointerCapture?.(event.pointerId);
      paint(event);
    }
  });
  app.canvas.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch') {touchPointerMove(event);return;}
    if (rightDown && lastPointer) {
      cameraPan(event.clientX - lastPointer.x, event.clientY - lastPointer.y);
      lastPointer = { x: event.clientX, y: event.clientY };
    }
    if (leftDown) {
      lastLeftPoint = { clientX: event.clientX, clientY: event.clientY };
      if (!focusArmed) paint(event, true);
    }
  });
  const endMouse = event => {
    if (event.pointerType === 'touch') {touchPointerEnd(event);return;}
    if (event.button === 2) rightDown = false;
    if (event.button === 0) { leftDown = false; lastLeftPoint = null; }
    lastPointer = null;
  };
  app.canvas.addEventListener('pointerup', endMouse);
  app.canvas.addEventListener('pointercancel', event => {
    if (event.pointerType === 'touch') {touchPointerEnd(event);return;}
    leftDown = rightDown = false;
    lastPointer = null; lastLeftPoint = null;
  });
  window.addEventListener('pointerup', endMouse);
  window.addEventListener('blur', () => {
    leftDown = rightDown = false;
    lastPointer = lastLeftPoint = null;
    touchSession = null;
    fingerPositions.clear();
    pointerSession = null;
    pointerFingers.clear();
  });
  app.canvas.addEventListener('wheel', event => {
    event.preventDefault();
    setScaleAt(event.clientX, event.clientY, Math.exp(-event.deltaY * .0012));
  }, { passive: false });

  app.ticker.add(tick => {
    if (leftDown && brush && !focusArmed && lastLeftPoint &&
        performance.now() - leftDownAt > 240 &&
        performance.now() - lastPaint >= Number($('spawnRate').value)) paint(lastLeftPoint, true);
    if (touchSession && fingerPositions.size === 1 && !touchSession.gesture &&
        !touchSession.moved && brush && !focusArmed &&
        performance.now() - touchSession.startedAt > 300 &&
        performance.now() - lastPaint >= Number($('spawnRate').value)) {
      touchSession.held = true;
      const p = touchSession.lastPoint;
      paint({ clientX: p.x, clientY: p.y }, true);
    }
    // Pointer-touch-only browsers also support one-finger hold painting.
    if (pointerSession && pointerFingers.size===1 && !touchSession &&
        performance.now()-lastNativeTouch>=1000 && !pointerSession.gesture &&
        !pointerSession.moved && brush && !focusArmed &&
        performance.now()-pointerSession.startedAt>300 &&
        performance.now()-lastPaint>=Number($('spawnRate').value)) {
      pointerSession.held=true;
      const p=pointerSession.lastPoint;
      paint({clientX:p.x,clientY:p.y},true);
    }
    if (state === 'running') {
      accumulator=Math.min(accumulator+Math.min(tick.deltaMS/1000,.15)*Number($('speed').value),DT*config.maxSteps);
      const deadline=performance.now()+config.frameBudget;
      while(accumulator+1e-9>=DT && state==='running'){
        t+=DT;step(DT);accumulator-=DT;
        if(performance.now()>=deadline){accumulator=Math.min(DT,accumulator);break;}
      }
      if(t-lastVisionDraw>=.1){lastVisionDraw=t;drawVision();}
      update();
    }
    if (focusedUnit) {
      centerOnFocus();
      $('focusStatus').textContent = ' · Following ' +
        (get(modeKey('inspect'))?focusedUnit.type+' #'+focusedUnit.sequence+' · '+focusedUnit.aiState+' · target '+(focusedUnit.target?.sequence??'—')+' · '+(senses[focusedUnit.type].fov?'limited FOV':'360° unlimited')+' · brain '+((aiInterval()+focusedUnit.sequence-(stepNumber%aiInterval()))%aiInterval()*DT).toFixed(2)+' s · idle '+Math.max(0,focusedUnit.idleUntil-t).toFixed(1)+' s · fear '+Math.max(0,focusedUnit.fearUntil-t).toFixed(1)+' s · exposure '+Math.round(focusedUnit.exposure)+' ms · incubation '+(focusedUnit.incubation===null?'—':Math.ceil(focusedUnit.incubation)+' ms'):focusedUnit.type);
    }
    drawCrosshairs();
  });

  // Diagnostics can be enabled explicitly using ?inputdebug=1.
  // Not exposed in the normal deployed app; useful to verify cursor mapping.
  if (new URLSearchParams(location.search).has('inputdebug') || window.__forceSwarmDebug === true) {
    window.__swarmInputDebug = {
      scenario:items=>{
        ++generation;preparing=false;clear();nextSequence=0;stepNumber=0;t=0;accumulator=0;
        for(const [kind,x,y,angle=0] of items){const u=add(kind,x,y);u.angle=u.heading=u.wanderHeading=angle;}
        seeded=isZombieMode()&&items.some(([kind])=>kind==='zombie');outbreakAt=seeded?0:null;
        setState('paused');update(true);
      },
      move:(i,x,y)=>teleport(units[i],x,y),
      profile:enabled=>{profiling=!!enabled;return {...profile,buildMs:lastBuildMs};},
      round:()=>({roundSeed,preparing,arena,outer,radius:RADIUS,count:units.length,state,t,activePairs:physicalPairs.size,bodies:world.bodies.length,retired:retired.length}),

      pointerWorld: (x, y) => pointerWorld({ clientX:x, clientY:y }),
      screenPoint, zoom: () => scale,
      camera: () => ({x:camera.x,y:camera.y}),
      units: () => units.map(u => ({id:u.sequence,ai:u.aiState,target:u.target?.sequence,exposure:u.exposure,incubation:u.incubation,type:u.type,x:u.body.position[0],y:u.body.position[1],
        stamina:u.stamina,resting:u.restState,vx:u.body.velocity[0],vy:u.body.velocity[1]})),
      lastPlaced: () => lastInputWorld,
      time: () => t,
      scareFirstHuman: () => {const u=units.find(o=>o.type==='human');if(u){u.fearUntil=t+config.fearDuration/1000;assignState(u,'Hs');}},
      infectFirstHuman: () => { const u=units.find(o=>o.type==='human'); if(u){ change(u,'zombie'); startOutbreak(); } },
      fingerCount: () => fingerPositions.size,
      gestureActive: () => Boolean(touchSession?.gesture),
      stepSimulation: n => {for(let i=0;i<n;i++){t+=DT;step(DT);}update(true);drawCrosshairs();},
      placePair: (typeA,typeB,x=300,y=300,offset=RADIUS*1.7) => {
        clear();setState('running');mode=$('mode').value;
        const a=add(typeA,x,y),b=add(typeB,x+offset,y);
        a.immuneUntil=b.immuneUntil=0;
        return [a.body.id,b.body.id];
      },
      setPairVelocity: (a,b) => {
        if(units.length<2)return;
        impulse=[a,b];
      },
      contactFilters: () => units.map(u=>({
        type:u.type,group:u.body.shapes[0].collisionGroup,mask:u.body.shapes[0].collisionMask
      })),
      diagramText: () => $('diagram').textContent
    };
  }
  function run() {
    if(preparing||retired.length||!units.length)return;
    if (state === 'ready' || state === 'paused') setState('running');
    else if (state === 'running') setState('paused');
  }
  $('run').onclick = run;
  $('startBig').onclick = run;
  $('reset').onclick = reset;
  $('again').onclick = reset;
  $('fit').onclick = () => { setFocus(null); fit(); saveCamera(); };
  $('focusTool').onclick = armFocus;
  $('unfocus').onclick = () => setFocus(null);
  $('closeResult').onclick = () => $('result').classList.remove('show');
  $('mode').onchange = () => {
    S.setSetting('game.mode',$('mode').value,'game');
    enterMode();
  };
  $('boundaryMode').oninput = $('boundaryMode').onchange = updateBoundary;
  $('wallWidth').oninput = $('wallWidth').onchange = updateBoundary;
  $('showBounds').onchange=()=>units.forEach(outline);
  $('markerThreshold').oninput = () => {
    $('markerThresholdValue').textContent=$('markerThreshold').value+' px';drawCrosshairs();
  };
  $('showFov').onchange = drawVision;
  $('showHearing').onchange = drawVision;
  $('speed').oninput = () => { $('speedValue').textContent = $('speed').value + '×'; };
  $('headsAcross').oninput = () => {
    $('headsAcrossValue').textContent = $('headsAcross').value;
    resizeCreatures();
  };
  for (const [id, suffix] of [
    ['rpsSpeed',''],['immunityTime','s'],['spawnExtent','× screen'],
    ['wanderSpeed',''],['fleeSpeed',''],['zombieSpeed',''],
    ['staminaStart','%'],['staminaDrain','%/s'],['staminaRest','s'],['staminaMinSpeed','%'],
    ['zombieBoostRange',' heads'],['zombieBoostFactor','×'],['aiInterval',' frames'],
    ['spawnBurst','/tick'],
    ['fixationMin','s'],['fixationMax','s'],['spawnRate','ms'],['spawnSpread',' heads']
  ]) $(id).oninput = () => { $(id + 'Value').textContent = $(id).value + suffix; };
  for (const [panel, id] of [['statsPanel','statsOpacity'],['spawnPanel','spawnOpacity']]) {
    const slider = $(id);
    slider.oninput = () => {
      $(panel).style.setProperty('--panel-opacity', (Number(slider.value) / 100).toFixed(2));
      $(id + 'Label').textContent = slider.value + '%';
    };
    slider.dispatchEvent(new Event('input'));
  }
  function updateTimeLimit() {
    $('survivalTime').disabled = unlimitedOutbreak();
    $('survivalTime').value = survivalSeconds();
    testWinner(); update(true);
  }
  $('survivalTime').onchange = updateTimeLimit;
  $('unlimitedTime').onchange = updateTimeLimit;
  for (const panel of ['statsPanel', 'spawnPanel']) {
    document.querySelector(`[data-toggle="${panel}"]`).onclick = () => {
      const opening = $(panel).classList.contains('hidden');
      if (opening && matchMedia('(max-width:700px)').matches) {
        for (const other of ['statsPanel','spawnPanel']) if (other !== panel) $(other).classList.add('hidden');
      }
      $(panel).classList.toggle('hidden');
    };
    document.querySelector(`[data-close="${panel}"]`).onclick = () => $(panel).classList.add('hidden');
  }
  window.addEventListener('keydown', event => {
    if ($('settingsWindow').open) return;
    if (event.key === 'Escape') { brush = null; S.setSetting(modeKey('brush'),null,'game');selection(); }
    if (event.code === 'Space' && !['INPUT', 'SELECT','BUTTON'].includes(document.activeElement.tagName)) {
      event.preventDefault(); run();
    }
  });
  window.addEventListener('resize', () => {
    app.renderer.resize(innerWidth, innerHeight);
    redraw(); drawVision();
  });
  $('saveResult').onclick = () => {
    const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 620;
    const g = canvas.getContext('2d');
    g.fillStyle = ink['ground']; g.fillRect(0, 0, 1000, 620);
    g.strokeStyle = ink['export-border']; g.lineWidth = 8; g.strokeRect(24, 24, 952, 572);
    g.textAlign = 'center'; g.fillStyle = ink['grid-text']; g.font = 'bold 30px '+ink['window-font'];
    g.fillText(`SWARM ARENA · ${isZombieMode() ? 'OUTBREAK' : mode === '3' ? 'CLASSIC' : 'RPSLS'}`, 500, 95);
    const actual = isZombieMode()
      ? (units.some(u => u.type === 'human') ? 'human' : 'zombie')
      : units[0]?.type || 'rock';
    const img = new Image();
    img.onload = () => {
      g.drawImage(img, 425, 120, 150, 150);
      g.fillStyle = ink['window-text']; g.font = 'bold 57px '+ink['window-font'];
      g.fillText(isZombieMode() ? actual === 'human' ? 'HUMANS SURVIVED!' : 'ZOMBIES TAKE OVER!' : actual.toUpperCase() + ' WINS!', 500, 350);
      g.font = '26px '+ink['window-font'];
      g.fillStyle = chosen === actual ? ink['win'] : ink['loss'];
      g.fillText(chosen ? (chosen === actual ? 'YOUR PICK WON!' : 'Your pick: ' + chosen.toUpperCase()) : 'No prediction selected', 500, 410);
      g.fillStyle = ink['grid-text']; g.font = '22px '+ink['window-font'];
      g.fillText(`${units.filter(u => u.type === actual).length} survivors  •  ${Math.round(t)} seconds  •  Just for fun`, 500, 480);
      const a = document.createElement('a'); a.download = 'swarm-arena-result.png';
      a.href = canvas.toDataURL('image/png'); a.click();
    };
    img.src = T.icon(actual);
  };

  function saveCamera() { S.setSetting(modeKey('camera'),{x:camera.x,y:camera.y,zoom:scale},'game'); }
  function restoreCamera() {
    const c=get(modeKey('camera'));scale=clampZoom(c.zoom);camera.scale.set(scale);camera.position.set(c.x,c.y);
    $('zoomLabel').textContent=Number((scale*100).toPrecision(4))+'%';
  }
  function applyPanels() {
    for(const id of ['statsPanel','spawnPanel']) {
      const value=get('hud.'+id);
      $(id).classList.toggle('hidden',value==='closed'||(value==='auto' && matchMedia('(max-width:700px)').matches));
    }
  }
  function enterMode() {
    mode=get('game.mode');readColors();S.restoreControls(mode);HEAD=calculatedHead();RADIUS=HEAD*.44;CATCH=2*RADIUS+Math.max(1,HEAD*.05);restoreCamera();reset();
    for(const el of S.controls) if(el.id!=='wallWidth' && el.id!=='boundaryMode')el.oninput?.();
    $('survivalTime').disabled=unlimitedOutbreak();
    applyPanels();V.syncHUD(mode);redraw();
  }
  for (const el of S.controls.filter(el=>el.id!=='mode')) {
    const save=()=>{
      const path=S.pathFor(el,mode), value=S.valueOf(el);
      if(S.schema.get(path).valid(value)) S.setSetting(path,value,'game');
      if(el.id==='borderStyle') {V.syncHUD(mode);redraw();}
    };
    el.addEventListener('input',save);el.addEventListener('change',()=>{save();const path=S.pathFor(el,mode);if(!S.schema.get(path).valid(S.valueOf(el)))el.value=get(path);S.flush();});
  }
  for(const b of document.querySelectorAll('[data-toggle],[data-close]')) b.addEventListener('click',()=>{
    for(const id of ['statsPanel','spawnPanel']) S.setSetting('hud.'+id,$(id).classList.contains('hidden')?'closed':'open','game');
    redraw();
  });
  let queue=Promise.resolve();
  function serialized(fn) {
    const next=queue.then(fn);
    queue=next.catch(e=>console.warn('Arena appearance',e));
    return next;
  }
  async function switchTheme() {
    const id=get('theme.id');if(id===T.id)return;
    try{await stageTheme(id,[...T.loaded.keys()]);}
    catch(e){console.warn(e);await stageTheme('classic',[...T.loaded.keys()]);S.setSetting('theme.id','classic','game');}
    for(const u of units)updateAppearance(u);
    if($('result').classList.contains('show')){
      const actual=isZombieMode()?(units.some(u=>u.type==='human')?'human':'zombie'):units[0]?.type;
      if(actual) $('resultIcon').src=T.icon(actual);
    }
    buildUI();V.renderStates();redraw();drawVision();drawCrosshairs();
    await T.releaseUnused();
    if(SwarmWindow.open())SwarmWindow.render();
  }
  S.subscribe((paths,source)=>{
    if(!paths.length)return;
    if(paths.some(p=>p.startsWith(modeKey('ai.'))||Object.hasOwn(config,p.slice(modeKey('').length))))refreshConfig();
    if(source==='game')return;
    if(paths.includes('theme.id'))serialized(switchTheme);
    if(get('game.mode')!==mode) {enterMode();return;}
    {
      const affected=S.controls.filter(el=>el.id!=='mode' && paths.includes(S.pathFor(el,mode)));
      for(const el of affected){
        const v=get(S.pathFor(el,mode)),old=S.valueOf(el);
        if(el.type==='checkbox')el.checked=v;else el.value=v;
        el.oninput?.();
        if(old!==v) el.onchange?.();
      }
      if(paths.includes(modeKey('camera')))restoreCamera();
      if(paths.includes(modeKey('pick')) && (state==='ready'||(isZombieMode()&&!seeded)))chosen=get(modeKey('pick'));
      if(paths.includes(modeKey('brush')))brush=get(modeKey('brush'));
      if(paths.some(p=>p.startsWith(modeKey('colors.')))){readColors();buildUI();for(const u of units)updateAppearance(u);drawCrosshairs();}
      selection();if(paths.some(p=>p==='hud.statsPanel'||p==='hud.spawnPanel'))applyPanels();
    }
    if(paths.includes('hud.states.expanded'))V.renderStates();
    V.syncHUD(mode);redraw();
  });
  window.SwarmVisuals={
    resolveAppearance:T.resolveAppearance, setStateCounts:V.setStateCounts,updatePopulation:V.updatePopulation,
    drawMap:V.drawMap,renderRulesDiagram:V.renderRulesDiagram,diagnostics:T.diagnostics,grid:V.grid,
    async setVisualState(u,id) {
      const allowed={human:['H','Hs','Hi'],zombie:['Z','Zi','Zh','Zc','Za']};
      if(id!==null && !(allowed[u.type]||[T.codes[u.type]]).includes(id))throw Error('State does not match species');
      const type=u.type;
      return serialized(async()=>{
        if(id && !T.loaded.has(id))T.loaded.set(id,(await T.loadStates(T.id,[id])).get(id));
        if(u.type!==type||u.body.agent!==u)return;
        u.visualState=id;updateAppearance(u);
      });
    }
  };
  window.SwarmRound={get seed(){return roundSeed;},get preparing(){return preparing;}};
  enterMode();
  document.documentElement.removeAttribute('data-booting');

})().catch(error => {
  document.documentElement.removeAttribute('data-booting');
  console.error(error);
  const msg = document.getElementById('debugMsg');
  msg.style.display = 'block';
  msg.textContent = 'Unable to start demo: ' + error.message + '\nCheck the browser console, scripts and assets/ directory.';
});

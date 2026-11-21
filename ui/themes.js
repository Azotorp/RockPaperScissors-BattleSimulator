// All resource paths originate in the build-validated registry.
window.SwarmThemes = (() => {
  const registry = window.SwarmRegistry;
  const codes = {rock:'R', paper:'P', scissors:'Sc', lizard:'L', spock:'Sp', human:'H', zombie:'Z', 'human-scared':'Hs'};
  const stateIds = Object.keys(registry.classic.states);
  const cache = new Map();
  const live = new Map();
  let current = 'classic';
  const placeholder = {frames:[], pivot:[.5,.5], size:[1,1], facingDegrees:0, fps:1};
  function candidates(theme, type, state) {
    const id = codes[state] || state || codes[type];
    const base = codes[type] || (id?.startsWith('Z') ? 'Z' : id?.startsWith('H') ? 'H' : id);
    const results = [];
    for (const group of new Set([theme, 'classic'])) {
      for (const key of new Set([id,base])) {
        const item = registry[group]?.states[key];
        if (item) results.push({...item, frames:item.frames.map(f => 'assets/themes/' + group + '/' + f)});
      }
    }
    return results;
  }
  function resolveAppearance(theme, type, state) {
    return candidates(theme,type,state)[0] || placeholder;
  }
  function texture(url) {
    if (!cache.has(url)) cache.set(url, PIXI.Assets.load(url).catch(err => {cache.delete(url); throw err;}));
    return cache.get(url);
  }
  const infectionFrames=new WeakMap();
  function infectionBase(texture){
    if(infectionFrames.has(texture))return infectionFrames.get(texture);
    const source=texture.source.resource;
    if(!source?.width || !source.height)return texture;
    // A neutral base lets the sprite tint stay yellow over the original warm skin.
    const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
    const context=canvas.getContext('2d');context.filter='grayscale(1) brightness(1.22)';
    context.drawImage(source,0,0);
    const neutral=PIXI.Texture.from(canvas);infectionFrames.set(texture,neutral);
    return neutral;
  }
  async function prepare(theme, id) {
    for (const appearance of candidates(theme,null,id)) {
      try {
        const frames=await Promise.all(appearance.frames.map(texture));
        return {...appearance,textures:id==='Hi'?frames.map(infectionBase):frames};
      } catch (error) { console.warn('Swarm appearance unavailable', id, error); }
    }
    return {...placeholder, textures:[PIXI.Texture.WHITE]};
  }
  async function loadStates(theme, ids) {
    return new Map(await Promise.all([...new Set(ids)].map(async id => [id,await prepare(theme,id)])));
  }
  function activate(theme, prepared) {
    current = theme;
    live.clear();
    prepared.forEach((value,id) => live.set(id,value));
    document.documentElement.dataset.theme = theme;
  }
  function make(id) {
    const a = live.get(id);
    const s = a.textures.length === 1 ? new PIXI.Sprite(a.textures[0]) : new PIXI.AnimatedSprite(a.textures);
    if (a.textures.length > 1) { s.animationSpeed = a.fps / 60; s.play(); }
    s.anchor.set(...a.pivot);
    return s;
  }
  async function releaseUnused() {
    const used = new Set([...live.values()].flatMap(a => a.frames));
    for (const url of [...cache.keys()]) if (!used.has(url)) {
      cache.delete(url);
      await PIXI.Assets.unload(url);
    }
  }
  function icon(type) { const id=codes[type] || type;return (live.get(id) || resolveAppearance(current,type,id)).frames[0] || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22%3E%3Cpath fill=%22%23ddd%22 d=%22M10 2h4v8h8v4h-8v8h-4v-8H2v-4h8z%22/%3E%3C/svg%3E'; }
  return {registry,codes,stateIds,resolveAppearance,loadStates,activate,make,releaseUnused,icon,
    get id(){return current;}, get theme(){return registry[current];}, get loaded(){return live;},
    diagnostics:() => ({theme:current, states:live.size, textures:cache.size, animatedStates:[...live.values()].filter(a=>a.textures.length>1).length})};
})();

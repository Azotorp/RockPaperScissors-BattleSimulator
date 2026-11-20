window.SwarmOverlayLayout=(()=>{
  const s=SwarmSettings;
  for(const edge of document.querySelectorAll('.edge'))edge.id=[...edge.classList].find(c=>c.startsWith('edge-'));
  const panels=s.overlays.map(id=>document.getElementById(id)).filter(Boolean);
  const toolbar=document.createElement('div');
  toolbar.id='layoutTools';toolbar.hidden=true;
  const addButton=(label,action)=>{
    const b=document.createElement('button');b.textContent=label;b.onclick=action;toolbar.append(b);
  };
  addButton('Done moving',()=>{document.body.classList.remove('moving-overlays');toolbar.hidden=true;});
  function reset(){
    for(const el of panels)s.setSetting('hud.layout.'+el.id,null,'layout');
    applyAll();s.flush();
  }
  addButton('Reset positions',reset);document.body.append(toolbar);
  let drag=null,suppressClick=false;
  const clamp=n=>Math.max(0,Math.min(1,n));
  function dimensions(el){
    return [Math.max(0,innerWidth-el.offsetWidth),Math.max(0,innerHeight-el.offsetHeight)];
  }
  function apply(el,pos){
    el.toggleAttribute('data-positioned',!!pos);
    if(!pos){el.style.removeProperty('--overlay-x');el.style.removeProperty('--overlay-y');return;}
    const [width,height]=dimensions(el);
    el.style.setProperty('--overlay-x',Math.round(pos[0]*width)+'px');
    el.style.setProperty('--overlay-y',Math.round(pos[1]*height)+'px');
  }
  function applyAll(){for(const el of panels)apply(el,s.getSetting('hud.layout.'+el.id));}
  const observer=new ResizeObserver(entries=>{
    for(const {target} of entries)if(target!==drag?.el)apply(target,s.getSetting('hud.layout.'+target.id));
  });
  for(const el of panels){
    el.dataset.overlay='';observer.observe(el);
    el.addEventListener('pointerdown',event=>{
      const dialogHeader=el.id==='settingsWindow' && event.target.closest('header') && !event.target.closest('button');
      if((!dialogHeader && toolbar.hidden) || event.button!==0 || !event.isPrimary)return;
      const r=el.getBoundingClientRect();
      drag={el,id:event.pointerId,dx:event.clientX-r.left,dy:event.clientY-r.top,x:event.clientX,y:event.clientY,moved:false};
      if(!toolbar.hidden){event.preventDefault();event.stopPropagation();}
      el.setPointerCapture(event.pointerId);
    },true);
  }
  window.addEventListener('pointermove',e=>{
    if(!drag || drag.id!==e.pointerId)return;
    if(!drag.moved && Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<4)return;
    const [width,height]=dimensions(drag.el);
    drag.pos=[clamp((e.clientX-drag.dx)/(width||1)),clamp((e.clientY-drag.dy)/(height||1))];
    drag.moved=true;apply(drag.el,drag.pos);e.preventDefault();
  },true);
  function finish(e){
    if(!drag || e.pointerId!==drag.id)return;
    const {el,moved,pos}=drag;drag=null;
    if(moved){
      s.setSetting('hud.layout.'+el.id,pos,'layout');s.flush();
      suppressClick=true;setTimeout(()=>{suppressClick=false;},0);
    }
  }
  window.addEventListener('pointerup',finish,true);window.addEventListener('pointercancel',finish,true);
  window.addEventListener('click',e=>{
    if(suppressClick || (!toolbar.hidden && e.target.closest('[data-overlay]'))){e.preventDefault();e.stopImmediatePropagation();}
  },true);
  s.subscribe(paths=>{if(paths.some(p=>p.startsWith('hud.layout.')))applyAll();});
  window.addEventListener('resize',applyAll);s.ready.then(applyAll);
  return {edit(){document.body.classList.add('moving-overlays');toolbar.hidden=false;},reset};
})();

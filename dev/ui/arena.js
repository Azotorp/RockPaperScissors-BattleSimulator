window.SwarmArenaView = (() => {
  const $ = id => document.getElementById(id);
  const settings=SwarmSettings, themes=SwarmThemes, get=settings.getSetting;
  const stateLabels={H:'Calm human',Hs:'Frightened human',Hi:'Infected human',Zi:'Idle zombie',Zh:'Hunting zombie',Zc:'Chasing zombie',Za:'Attacking zombie'};
  let counts={}, palette={}, gridInfo={};
  function applyPalette() {
    const css=getComputedStyle(document.documentElement);
    for (const name of ['ground','grid-minor','grid-major','grid-axis','grid-text','grid-font','wall-light','wall-dark','wrap-x','wrap-y','grid-spacing','grid-width']) {
      palette[name]=css.getPropertyValue('--'+name).trim();
    }
  }
  function metric(n,step) {
    const unit=Math.max(Math.abs(n),step);
    const [factor,label]=unit>=1e9?[1e9,'Gm']:unit>=1e6?[1e6,'Mm']:unit>=1000?[1000,'km']:[1,'m'];
    const digits=Math.max(0,Math.min(10,Math.ceil(-Math.log10(step/factor))));
    return (n>0?'+':'')+(n/factor).toFixed(digits)+' '+label;
  }
  function drawMap({x,y,zoom,width,height,metersPerWorldUnit,boundary,wallPx,bounds}) {
    const canvas=$('metricMap'), dpr=Math.min(devicePixelRatio,2);
    if(canvas.width!==Math.round(width*dpr) || canvas.height!==Math.round(height*dpr)) {
      canvas.width=Math.round(width*dpr); canvas.height=Math.round(height*dpr);
    }
    const g=canvas.getContext('2d'); g.setTransform(dpr,0,0,dpr,0,0);
    g.fillStyle=palette.ground; g.fillRect(0,0,width,height);
    const ppm=zoom/metersPerWorldUnit;
    const target=(parseFloat(palette['grid-spacing'])||100)/ppm;
    const decade=10**Math.floor(Math.log10(target));
    const step=([1,2,5,10].find(k=>k*decade>=target)||10)*decade;
    const gap=step*ppm;
    const lineColor = key => get('grid.'+key)==='theme'?palette['grid-'+key]:get('grid.'+key);
    // Bound loops by the viewport, even at numerical camera limits.
    function ticks(axis,origin,extent) {
      const first=Math.ceil(-origin/gap), limit=Math.ceil(extent/gap)+1;
      for(let i=0;i<limit;i++) {
        const tick=first+i, px=origin+tick*gap;
        if(px<-.01 || px>extent+.01) continue;
        g.strokeStyle=lineColor(tick===0?'axis':tick%5===0?'major':'minor');
        g.lineWidth=(Number(palette['grid-width'])||1)*(tick===0?2:1);
        g.beginPath();
        if(axis==='x'){g.moveTo(px,0);g.lineTo(px,height);}else{g.moveTo(0,px);g.lineTo(width,px);}
        g.stroke();
        if(!get('grid.labels')) continue;
        const text=metric((axis==='x'?tick:-tick)*step,step);
        g.fillStyle=palette['grid-text']; g.font=palette['grid-font'];
        const length=g.measureText(text).width;
        function label(left,baseline) {
          const right=left+length, top=baseline-12;
          if(left<1 || right>width-1 || top<1 || occupied.some(r=>left<r.right+4 && right>r.left-4 && top<r.bottom+3 && baseline>r.top-3)) return;
          g.fillText(text,left,baseline);
        }
        if(axis==='x') label(px-length/2,height-8);
        else {label(6,px-4);label(width-length-6,px-4);}
      }
    }
    const occupied=[...document.querySelectorAll('.panel:not(.hidden),.hud,.launchers,#settingsOpen,.arena-distribution,.prestart:not(.hidden),#stateLegend:not([hidden])')].map(el=>el.getBoundingClientRect());
    if(get('grid.visible')) {ticks('x',x,width);ticks('y',y,height);}
    const left=bounds?x+bounds.left*zoom:0,top=bounds?y+bounds.top*zoom:0;
    const right=bounds?x+bounds.right*zoom:width,bottom=bounds?y+bounds.bottom*zoom:height;
    if(boundary!=='none'){
      const px=boundary==='walls'?Math.max(1,Math.min(wallPx,(right-left)/2,(bottom-top)/2)):1;
      const edges=[[left,top,right-left,px,0,px,'wrap-y'],[left,bottom-px,right-left,px,0,-px,'wrap-y'],
        [left,top,px,bottom-top,px,0,'wrap-x'],[right-px,top,px,bottom-top,-px,0,'wrap-x']];
      for(const [sx,sy,w,h,dx,dy,color] of edges){
        const l=Math.max(0,sx),r=Math.min(width,sx+w),t=Math.max(0,sy),b=Math.min(height,sy+h);
        if(l>=r||t>=b)continue;
        if(boundary==='walls'){
          const gx=dx<0?sx+w:sx,gy=dy<0?sy+h:sy;
          const gradient=g.createLinearGradient(gx,gy,gx+dx,gy+dy);
          gradient.addColorStop(0,palette['wall-light']);gradient.addColorStop(1,palette['wall-dark']);g.fillStyle=gradient;
        }else g.fillStyle=palette[color];
        g.fillRect(l,t,r-l,b-t);
      }
    }
    gridInfo={step,gap,metersPerWorldUnit};
  }
  function renderRulesDiagram(mode,rules){
    $('diagram').hidden=mode==='zombie' || !get(settings.modePath(mode,'diagram'));
    if(mode==='zombie'){$('diagram').style.display='none';$('diagram').innerHTML='';return;}
    $('diagram').style.display='';
    const verbs={rock:{scissors:'crushes',lizard:'crushes'},paper:{rock:'covers',spock:'disproves'},
      scissors:{paper:'cuts',lizard:'decapitates'},lizard:{paper:'eats',spock:'poisons'},
      spock:{rock:'vaporizes',scissors:'smashes'}};
    const kinds=Object.keys(rules),pos={},edges=[],labels=[],nodes=[];
    kinds.forEach((a,i)=>{const angle=-Math.PI/2+i*2*Math.PI/kinds.length;pos[a]=[300+218*Math.cos(angle),300+218*Math.sin(angle)];});
    let edgeIndex=0;
    for(const a of kinds)for(const b of kinds)if(rules[a].includes(b)){
      const [x1,y1]=pos[a],[x2,y2]=pos[b],dx=x2-x1,dy=y2-y1,length=Math.hypot(dx,dy),f=40/length;
      const ux=dx/length,uy=dy/length,curve=kinds.length===5?(edgeIndex++%2===0?9:-9):0;
      const mx=(x1+x2)/2-uy*curve,my=(y1+y2)/2+ux*curve;
      edges.push(`<path d="M ${x1+dx*f} ${y1+dy*f} Q ${mx} ${my} ${x2-dx*f} ${y2-dy*f}" stroke="var(--rule-arrow)" stroke-width="4" fill="none" marker-end="url(#swarmArrow)"/>`);
      labels.push(`<text x="${mx-uy*15}" y="${my+ux*15}" text-anchor="middle" dominant-baseline="central" fill="var(--rule-label)" stroke="var(--rule-stroke)" stroke-width="5" paint-order="stroke" font-family="system-ui" font-size="${kinds.length===3?19:15}" font-weight="700">${verbs[a][b]}</text>`);
    }
    for(const a of kinds){
      const [x,y]=pos[a], primary=rules[a][0], [tx,ty]=pos[primary];
      const art=themes.loaded.get(themes.codes[a]), theta=Math.atan2(ty-y,tx-x)+art.facingDegrees*Math.PI/180;
      const [w,h]=art.size, [px,py]=art.pivot, c=Math.cos(theta), sn=Math.sin(theta);
      const corners=[[0,0],[1,0],[0,1],[1,1]].map(([i,j])=>[(i-px)*w,(j-py)*h]);
      const extent=Math.max(...corners.flatMap(([dx,dy])=>[Math.abs(dx*c-dy*sn),Math.abs(dx*sn+dy*c)]));
      const scaleToFit=40/extent;
      const frames=(art.frames.length ? art.frames : [themes.icon(a)]).map((url,i)=>{
        const n=art.frames.length;
        const animate=n>1?`<animate attributeName="visibility" calcMode="discrete" values="${Array.from({length:n+1},(_,j)=>j%n===i?'visible':'hidden').join(';')}" dur="${n/art.fps}s" repeatCount="indefinite"/>`:'';
        return `<image href="${url}" x="${-px*w}" y="${-py*h}" width="${w}" height="${h}">${animate}</image>`;
      });
      nodes.push(`<g data-node="${a}" transform="translate(${x} ${y}) rotate(${theta*180/Math.PI}) scale(${scaleToFit})">${frames.join('')}</g>`);
    }
    $('diagram').innerHTML=`<svg viewBox="0 0 600 600" role="img" aria-label="Arrows show who beats whom, labels describe why"><defs><marker id="swarmArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="var(--rule-arrow)"/></marker></defs>${edges.join('')}${labels.join('')}${nodes.join('')}</svg>`;
  }
  function categoryColor(kind) {
    const path=settings.modePath(get('game.mode'),'colors.'+kind);
    const value=settings.schema.has(path) ? get(path) : 'theme';
    return value==='theme'?themes.theme.categoryColors[kind]:value;
  }
  function population(kinds) {
    $('overviewLegend').replaceChildren();
    for (const kind of kinds) {
      const color=categoryColor(kind);
      const entry=document.createElement('span');entry.className='overview-item';entry.dataset.kind=kind;
      entry.style.setProperty('--kind',color);
      entry.style.setProperty('--name-color',themes.theme.nameColors?.[kind] || 'color-mix(in srgb, var(--kind) 75%, black)');
      entry.style.setProperty('--outline-color',themes.theme.outlineColors?.[kind] || 'color-mix(in srgb, var(--kind) 50%, black)');
      entry.innerHTML='<i class="overview-swatch"></i><strong></strong><span class="number"></span><b></b>';
      entry.querySelector('strong').textContent=kind[0].toUpperCase()+kind.slice(1);
      entry.querySelector('.number').id='overview-number-'+kind;entry.querySelector('b').id='overview-count-'+kind;
      $('overviewLegend').append(entry);
    }
  }
  function updatePopulation(numbers,chosen) {
    const total=Object.values(numbers).reduce((a,b)=>a+b,0);
    for (const [kind,n] of Object.entries(numbers)) {
      const item=$('overview-number-'+kind);
      if(!item) continue;
      item.textContent=n;item.parentNode.classList.toggle('selected',kind===chosen);
      const pct=(total?100*n/total:0).toFixed(1)+'%';
      $('overview-count-'+kind).textContent=pct;
      const bar=$('overview-bar-'+kind);bar.style.width=pct;bar.title=kind+': '+n+' ('+pct+')';
    }
  }
  function stateList(target,values,expanded) {
    for(const [id,label] of Object.entries(stateLabels)) {
      let item=target.querySelector('[data-state="'+id+'"]');
      if(!item){
        item=document.createElement('span');item.dataset.state=id;item.title=label;
        const img=new Image();img.alt='';item.append(img,document.createElement('span'));target.append(item);
      }
      const url=themes.icon(id), img=item.firstElementChild;
      if(img.getAttribute('src')!==url) img.src=url;
      const text=(expanded?label:id)+' '+(values[id]??'—');
      if(item.lastElementChild.textContent!==text)item.lastElementChild.textContent=text;
    }
  }
  function renderStates() {
    const expanded=get('hud.states.expanded');
    $('legendToggle').setAttribute('aria-expanded',String(expanded));
    stateList($('stateItems'),counts,expanded);
  }
  function setStateCounts(values={}) {counts=values;renderStates();}
  const widgets=[];
  function mountAutoHide(el,key,title) {
    const edge=document.createElement('button');edge.className='edge edge-'+key;edge.textContent=title;
    edge.setAttribute('aria-label','Reveal '+title);el.before(edge);
    let timer=0, enabled=false;
    function show(value) {clearTimeout(timer);el.classList.toggle('collapsed',enabled&&!value);edge.setAttribute('aria-expanded',String(!el.classList.contains('collapsed')));}
    function schedule(value,delay) {clearTimeout(timer);timer=setTimeout(()=>show(value),get('hud.'+key+'.'+delay));}
    for(const target of [edge,el]) {
      target.addEventListener('pointerenter',e=>{if(enabled && e.pointerType!=='touch') schedule(true,'enter');});
      target.addEventListener('pointerleave',e=>{if(enabled && e.pointerType!=='touch' && !el.contains(e.relatedTarget) && e.relatedTarget!==edge) schedule(false,'exit');});
      target.addEventListener('focusin',()=>show(true));
      target.addEventListener('focusout',e=>{if(enabled && !el.contains(e.relatedTarget) && e.relatedTarget!==edge) schedule(false,'exit');});
    }
    edge.onclick=()=>show(true);
    document.addEventListener('pointerdown',e=>{if(enabled && !el.contains(e.target) && e.target!==edge) schedule(false,'exit');});
    widgets.push(()=>{const next=get('hud.'+key+'.auto');
      const hidden=el.hidden;edge.hidden=!next||hidden;
      if(next!==enabled){enabled=next;show(!next);}
    });
  }
  function syncHUD(mode) {
    const root=document.documentElement.style;
    for(const part of ['bar','text','toolbar','states']) root.setProperty('--'+part+'-alpha',1-get('hud.'+part+'.transparency')/100);
    $('stateLegend').hidden=mode!=='zombie'||!get('hud.states.visible');
    $('diagram').style.opacity=get('modes.'+mode+'.diagramOpacity')/100;
    $('diagram').hidden=mode==='zombie'||!get('modes.'+mode+'.diagram');
    $('wallControl').hidden=$('boundaryMode').value!=='walls';
    $('wallWidthValue').textContent=$('wallWidth').value+' px';
    for(const sync of widgets) sync();
  }
  mountAutoHide($('arenaDistribution'),'population','Population');
  mountAutoHide(document.querySelector('.launchers'),'toolbar','Controls');
  mountAutoHide($('stateLegend'),'states','States');
  $('legendToggle').onclick=()=>settings.setSetting('hud.states.expanded',!get('hud.states.expanded'));
  return {stateLabels,categoryColor,renderRulesDiagram,drawMap,applyPalette,population,updatePopulation,renderStates,stateList,setStateCounts,syncHUD,metric,grid:()=>gridInfo};
})();

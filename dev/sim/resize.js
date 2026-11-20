// Plan the entire placement before applying it so a failed resize is atomic.
(() => {
  'use strict';
  function plan(agents, oldArea, area, radius, mode) {
    if (mode === 'none') return [];
    const left = area.left + radius, right = area.right - radius;
    const top = area.top + radius, bottom = area.bottom - radius;
    const margin = Math.min(.01, (right-left)/4, (bottom-top)/4);
    const spacing = 2*radius + margin;
    const buckets = new Map(), outsiders = [], moves = [];
    const cell = (n, origin) => Math.floor((n-origin)/spacing);
    const key = (i,j) => i+','+j;
    function reserve(x,y) {
      const k = key(cell(x,left),cell(y,top));
      if (!buckets.has(k)) buckets.set(k,[]);
      buckets.get(k).push([x,y]);
    }
    function free(x,y) {
      const i = cell(x,left), j = cell(y,top);
      for (let dx=-1; dx<=1; dx++) for (let dy=-1; dy<=1; dy++) {
        for (const [px,py] of buckets.get(key(i+dx,j+dy)) || []) {
          if ((x-px)**2 + (y-py)**2 < spacing**2) return false;
        }
      }
      return true;
    }
    function available(x,y) {
      if (x<left || x>right || y<top || y>bottom || !free(x,y)) return false;
      if (mode === 'wrap') {
        const xs=[0], ys=[0];
        if (x-area.left < spacing) xs.push(area.width);
        if (area.right-x < spacing) xs.push(-area.width);
        if (y-area.top < spacing) ys.push(area.height);
        if (area.bottom-y < spacing) ys.push(-area.height);
        for(const dx of xs) for(const dy of ys) if ((dx||dy) && !free(x+dx,y+dy)) return false;
      }
      return true;
    }
    for (const agent of agents) {
      const [x,y] = agent.body.position;
      if (x >= left && x <= right && y >= top && y <= bottom) reserve(x,y);
      else outsiders.push(agent);
    }
    const cols = Math.floor((right-left-2*margin)/spacing)+1;
    const rows = Math.floor((bottom-top-2*margin)/spacing)+1;
    let cursor=0;
    for (const agent of outsiders) {
      const [x,y] = agent.body.position;
      const targetX = Math.min(right-margin, Math.max(left+margin, area.left + (x-oldArea.left)/oldArea.width*area.width));
      const targetY = Math.min(bottom-margin, Math.max(top+margin, area.top + (y-oldArea.top)/oldArea.height*area.height));
      let landing = null;
      function tryPoint(px,py) {
        if (available(px,py)) landing = [px,py];
      }
      tryPoint(targetX,targetY);
      for (let ring=1; !landing && ring<=4; ring++) {
        for (let n=0; !landing && n<8*ring; n++) {
          const angle=n*Math.PI/(4*ring);
          tryPoint(targetX+ring*spacing*Math.cos(angle),targetY+ring*spacing*Math.sin(angle));
        }
      }
      // Earlier lattice points stay occupied as the plan grows.
      while (!landing && cursor<rows*cols) {
        const i=cursor++;
        tryPoint(left+margin+(i%cols)*spacing,top+margin+Math.floor(i/cols)*spacing);
      }
      if (!landing) throw Error('Resize cancelled. Could not place every outsider safely. Zoom out and try again.');
      reserve(...landing);
      moves.push({agent,x:landing[0],y:landing[1]});
    }
    return moves;
  }
  if (typeof module !== 'undefined') module.exports = plan;
  else window.SwarmResize = plan;
})();

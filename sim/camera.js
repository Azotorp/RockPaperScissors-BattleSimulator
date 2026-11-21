// Global view and chunk anchors use JS doubles. Body and sprite positions
// are relative to the active arena's anchor.
(() => {
  const halfMeters = 1e9;
  function minZoom(width,height,metersPerUnit) {
    return Math.min(width,height)*metersPerUnit/(2*halfMeters);
  }
  function ticks(start, metersPerUnit, step, zoom, extent) {
    const pitch = step/metersPerUnit, first = Math.ceil(start/pitch);
    const gap = pitch*zoom, offset = (first*pitch-start)*zoom;
    return Array.from({length:Math.ceil(extent/gap)+1},(_,i)=>({index:first+i,px:offset+i*gap}));
  }
  function translate(rect,dx,dy) {
    if (!rect) return null;
    return {...rect,left:rect.left+dx,right:rect.right+dx,top:rect.top+dy,bottom:rect.bottom+dy};
  }
  const api={halfMeters,minZoom,ticks,translate};
  if(typeof module!=='undefined') module.exports=api;
  else window.SwarmCamera=api;
})();

// All surfaces are in world units. Zoom is a rendering concern.
(() => {
  'use strict';
  function rectangle(left, top, right, bottom) {
    return {left, top, right, bottom, width: right - left, height: bottom - top};
  }

  function geometry(outer, mode, thickness, radius) {
    const inset = mode === 'none' ? 0 : thickness;
    const inner = rectangle(outer.left + inset, outer.top + inset,
      outer.right - inset, outer.bottom - inset);
    if (![inner.width, inner.height, radius, inset].every(Number.isFinite) ||
        inset < 0 || radius < 0 || Math.min(inner.width, inner.height) <= (mode === 'none' ? 0 : 2 * radius)) {
      throw Error('Arena too small for these walls and creature size. Reduce wall width or enlarge the arena.');
    }
    return inner;
  }

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  // A leading rim crossing the inner plane puts the trailing rim at its
  // paired plane. Carry any unused displacement through further crossings.
  function wrapAxis(value, low, high) {
    if (value >= low && value <= high) return value;
    const span = high - low;
    if (value > high) return low + (value - high) % span;
    return high - (low - value) % span;
  }

  function constrain(position, velocity, bounds, radius, mode) {
    if (mode === 'none') return false;
    let transferred = false;
    for (let axis = 0; axis < 2; axis++) {
      const low = (axis ? bounds.top : bounds.left) + radius;
      const high = (axis ? bounds.bottom : bounds.right) - radius;
      const p = position[axis];
      if (p >= low && p <= high) continue;
      if (mode === 'wrap') {
        position[axis] = wrapAxis(p, low, high);
        transferred = true;
      } else {
        // Project the endpoint of the swept axis onto the first hit plane.
        // The tangential component travels for the remainder of the step.
        position[axis] = clamp(p, low, high);
        if ((p < low && velocity[axis] < 0) || (p > high && velocity[axis] > 0)) velocity[axis] = 0;
      }
    }
    return transferred;
  }

  // Reconstruct straight pieces on either side of each hit. A teleport has
  // zero duration and never creates a sweep through the middle of the arena.
  function segments(x, y, endX, endY, bounds, radius, mode) {
    let vx = endX - x, vy = endY - y, from = 0;
    const left = bounds.left + radius, right = bounds.right - radius;
    const top = bounds.top + radius, bottom = bounds.bottom - radius;
    const result = [];
    function hitTime(p, speed, low, high) {
      if (speed === 0) return Infinity;
      return Math.max(0, ((speed > 0 ? high : low) - p) / speed);
    }
    while (from < 1) {
      const tx = hitTime(x, vx, left, right), ty = hitTime(y, vy, top, bottom);
      const duration = Math.min(1 - from, tx, ty);
      const until = from + duration;
      if (duration > 0) result.push({x, y, vx, vy, from, until});
      if (until >= 1) break;
      x += vx * duration;
      y += vy * duration;
      if (tx <= duration) {
        if (mode === 'wrap') x = vx > 0 ? left : right;
        else vx = 0;
      }
      if (ty <= duration) {
        if (mode === 'wrap') y = vy > 0 ? top : bottom;
        else vy = 0;
      }
      from = until;
    }
    return result;
  }

  function contactSpans(a, b, reach, wrap, visit) {
    for (const p of a) for (const q of b) {
      const lo = Math.max(p.from, q.from), hi = Math.min(p.until, q.until);
      if (hi < lo) continue;
      const dx = p.x + p.vx*(lo-p.from) - q.x - q.vx*(lo-q.from);
      const dy = p.y + p.vy*(lo-p.from) - q.y - q.vy*(lo-q.from);
      const vx = p.vx - q.vx, vy = p.vy - q.vy, duration = hi-lo;
      const length2 = vx*vx + vy*vy;
      // Overlap is possible only for images within the swept bounding box.
      const imageRange = (start, end, span) => span
        ? [Math.ceil((Math.min(start,end)-reach)/span), Math.floor((Math.max(start,end)+reach)/span)]
        : [0,0];
      const width = wrap ? wrap.width : 0, height = wrap ? wrap.height : 0;
      const [xmin,xmax] = imageRange(dx, dx+vx*duration, width);
      const [ymin,ymax] = imageRange(dy, dy+vy*duration, height);
      for(let i=xmin;i<=xmax;i++) for(let j=ymin;j<=ymax;j++) {
        const x = dx-i*width, y = dy-j*height, c = x*x+y*y-reach*reach;
        if (length2 < 1e-12) {
          if (c <= 0) visit(lo,hi);
          continue;
        }
        const dot = x*vx+y*vy, discriminant = dot*dot-length2*c;
        if (discriminant < 0) continue;
        const root = Math.sqrt(discriminant);
        const enter = Math.max(0,(-dot-root)/length2), exit = Math.min(duration,(-dot+root)/length2);
        if (enter <= exit) visit(lo+enter,lo+exit);
      }
    }
  }

  const api = {geometry, rectangle, clamp, constrain, segments, contactSpans};
  if (typeof module !== 'undefined') module.exports = api;
  else window.SwarmBoundary = api;
})();

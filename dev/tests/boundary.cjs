'use strict';
const assert = require('node:assert/strict');
const {rectangle, geometry, constrain} = require('../sim/boundary.js');
const {placements, trees, nearest} = require('../sim/core.js');
const outer = rectangle(-100, 10, 220, 150);
const inner = geometry(outer, 'walls', 20, 8);
assert.deepEqual(inner, rectangle(-80, 30, 200, 130));
assert.throws(() => geometry(outer, 'wrap', 62, 8), /too small/);
assert.deepEqual(geometry(outer, 'none', 100, 8), outer);
for (const mode of ['walls', 'wrap', 'none']) {
  for (const axis of [0, 1]) for (const sign of [-1, 1]) {
    const low = (axis ? inner.top : inner.left) + 8;
    const high = (axis ? inner.bottom : inner.right) - 8;
    const width = high - low;
    for (const laps of [0, 1, 10000]) {
      const pos = [42, 67], vel = [7, -3];
      pos[axis] = (sign > 0 ? high : low) + sign * (laps * width + 3);
      vel[axis] = sign * 900;
      const before = pos.slice(), velocity = vel.slice();
      const changed = constrain(pos, vel, inner, 8, mode);
      assert.equal(changed, mode === 'wrap');
      assert.equal(pos[1-axis], before[1-axis]);
      if (mode === 'none') assert.deepEqual(pos, before);
      if (mode === 'wrap') assert.equal(pos[axis], sign > 0 ? low + 3 : high - 3);
      if (mode === 'walls') {
        assert.equal(pos[axis], sign > 0 ? high : low);
        assert.equal(vel[axis], 0);
      } else assert.deepEqual(vel, velocity);
      assert.equal(constrain(pos, vel, inner, 8, mode), false);
    }
  }
}
const corner = [198, 125];
constrain(corner, [10, 10], inner, 8, 'wrap');
assert.deepEqual(corner, [-66, 41]);
for (const point of placements({seed:'inset', bounds:inner, counts:{rock:50}, radius:8, gap:2, distribution:'jitter'})) {
  assert(point.x >= inner.left + 8 && point.x <= inner.right - 8);
  assert(point.y >= inner.top + 8 && point.y <= inner.bottom - 8);
}
const unit = (sequence, type, x) => ({sequence,type,body:{position:[x,60]}});
const hunter = unit(0,'rock',-71), near = unit(1,'scissors',190), far = unit(2,'scissors',-40);
assert.equal(nearest(trees([hunter,near,far]), ['scissors'], hunter, Infinity, () => true, inner), near);
assert.equal(nearest(trees([hunter,near]), ['scissors'], hunter, Infinity, (_u,dx)=>dx>0, inner), null,
  'FOV must not see a long-way-around image of prey behind the hunter');
console.log('PASS inner surface, spawn, seam targeting, radius, directional and corner transfers, high-speed repeat crossings and no-boundary bypass');

const {segments, contactSpans} = require('../sim/boundary.js');
const box = rectangle(0,0,100,100);
function spans(path, x, y, reach, wrap) {
  const found = [];
  contactSpans(path, [{x,y,vx:0,vy:0,from:0,until:1}], reach, wrap,
    (lo,hi) => found.push([lo,hi]));
  return found;
}
const seam = segments(85,40,115,40,box,5,'wrap');
assert.equal(seam.length,2);
assert(spans(seam,94,40,1,box).length, 'approach side');
assert(spans(seam,17,40,1,box).length, 'exit side');
assert.equal(spans(seam,50,40,1,box).length,0, 'no chord across teleport');
const wallSlide = segments(85,30,115,60,box,5,'walls');
assert.deepEqual(wallSlide[1], {x:95,y:40,vx:0,vy:30,from:1/3,until:1});
assert(spans(wallSlide,95,51,1,null).length, 'tangential slide');
console.log('PASS swept contacts on approach and exit, wall sliding, no phantom contacts');

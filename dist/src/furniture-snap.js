/** Mouse-drag snapping in plan millimetres. No document objects are mutated. */
const EPS = 1e-7;
const dot = (a, b) => a.x * b.x + a.y * b.y;
const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
const clean = value => Math.abs(value) < EPS ? 0 : value;

/** Each target is one exposed face of a visible solid wall rectangle. Openings
 * remove wall faces and introduce jambs; no invisible line spans a doorway.
 */
export function buildWallSnapTargets(plan) {
  const objects = (plan?.objects || []).filter(o => o.visible !== false);
  const targets = [];
  for (const wall of objects) {
    if (wall.type !== 'wall' || !point(wall) || !(wall.width > 0) || !(wall.depth > 0)) continue;
    const angle = (wall.rotation || 0) * Math.PI / 180;
    const c = Math.cos(angle), s = Math.sin(angle), flip = wall.mirrorY ? -1 : 1;
    const vector = (x, y) => ({ x: c * x - s * y * flip, y: s * x + c * y * flip });
    const world = (x, y) => { const p = vector(x, y); return { x: wall.x + p.x, y: wall.y + p.y }; };
    const half = wall.width / 2, depth = wall.depth / 2;
    const slots = objects.filter(o => o.wallId === wall.id && ['door', 'window'].includes(o.type))
      .map(o => ({ start: Math.max(-half, (o.offset ?? half) - half - o.width / 2), end: Math.min(half, (o.offset ?? half) - half + o.width / 2) }))
      .filter(o => o.end > o.start).sort((a, b) => a.start - b.start);
    let cursor = -half, block = 0;
    const rectangle = (left, right) => {
      if (right - left <= EPS) return;
      const corners = [world(left, -depth), world(right, -depth), world(right, depth), world(left, depth)];
      const normals = [vector(0, -1), vector(1, 0), vector(0, 1), vector(-1, 0)];
      for (let side = 0; side < 4; side++) targets.push({
        id: `${wall.id}:${block}:${side}`, wallId: wall.id, label: wall.name || '墙体',
        a: corners[side], b: corners[(side + 1) % 4], normal: normals[side],
      });
      block++;
    };
    for (const slot of slots) {
      rectangle(cursor, slot.start);
      cursor = Math.max(cursor, slot.end);
    }
    rectangle(cursor, half);
  }
  return targets;
}

function footprint(object) {
  const angle = (object.rotation || 0) * Math.PI / 180;
  const c = Math.cos(angle), s = Math.sin(angle), w = object.width / 2, d = object.depth / 2;
  return [[-w, -d], [w, -d], [w, d], [-w, d]].map(([x, y]) => ({ x: c * x - s * y, y: s * x + c * y }));
}

function constraint(target, corners) {
  if (!point(target.a) || !point(target.b) || !point(target.normal)) return null;
  const length = Math.hypot(target.b.x - target.a.x, target.b.y - target.a.y);
  if (length <= EPS) return null;
  const normalLength = Math.hypot(target.normal.x, target.normal.y);
  if (normalLength <= EPS) return null;
  const n = { x: target.normal.x / normalLength, y: target.normal.y / normalLength };
  const tangent = { x: (target.b.x - target.a.x) / length, y: (target.b.y - target.a.y) / length };
  const minimum = Math.min(...corners.map(p => dot(p, n)));
  // Only the actual support corner/edge touches the wall, not the entire OBB's
  // tangent projection. This matters for a diagonal sofa near a doorway.
  const support = corners.filter(p => Math.abs(dot(p, n) - minimum) <= EPS);
  return { target, n, tangent, length, support, radius: -minimum, value: dot(target.a, n) - minimum };
}

function touchesSegment(c, position) {
  const projections = c.support.map(p => dot({ x: position.x + p.x - c.target.a.x, y: position.y + p.y - c.target.a.y }, c.tangent));
  return Math.max(...projections) >= -EPS && Math.min(...projections) <= c.length + EPS;
}

function project(c, position) {
  const delta = c.value - dot(position, c.n);
  return { x: position.x + c.n.x * delta, y: position.y + c.n.y * delta };
}

function intersection(a, b, raw) {
  const determinant = a.n.x * b.n.y - a.n.y * b.n.x;
  // Near-parallel walls should not amplify a small cursor move into a jump.
  if (Math.abs(determinant) < .2) return null;
  const da = a.value - dot(raw, a.n), db = b.value - dot(raw, b.n);
  const dx = (da * b.n.y - db * a.n.y) / determinant;
  const dy = (a.n.x * db - b.n.x * da) / determinant;
  if (Math.hypot(dx, dy) > Math.max(a.limit, b.limit) * 1.5 + EPS) return null;
  const result = { x: raw.x + dx, y: raw.y + dy };
  return touchesSegment(a, result) && touchesSegment(b, result) ? result : null;
}

/** 12 CSS px acquisition / 18 px release, capped at 150 / 225 mm when zoomed
 * out. `previous` is the last returned state from this drag only. Keyboard
 * nudges must bypass this function. Wall contact takes priority over the grid.
 */
export function snapFurniturePosition(object, rawPosition, targets, options = {}) {
  if (!point(rawPosition)) throw new Error('家具位置无效');
  const enabled = options.enabled !== false;
  const grid = enabled ? 50 : 1;
  const rounded = { x: Math.round(rawPosition.x / grid) * grid, y: Math.round(rawPosition.y / grid) * grid };
  const result = { ...rounded, state: { targetIds: [] }, label: enabled ? '网格 · 50 mm' : '', guides: [] };
  if (!enabled || object?.type !== 'furniture' || !(object.width > 0) || !(object.depth > 0)) return result;
  const scale = Number.isFinite(options.millimetresPerPixel) && options.millimetresPerPixel > 0 ? options.millimetresPerPixel : 1;
  const capture = Math.min(150, 12 * scale), release = Math.min(225, 18 * scale);
  const previous = new Set(options.previous?.targetIds || []);
  const corners = footprint(object);
  const candidates = [];
  for (const target of targets || []) {
    const c = constraint(target, corners);
    if (!c) continue;
    const gap = dot(rawPosition, c.n) - c.value;
    const held = previous.has(target.id), limit = held ? release : capture;
    // Only attract from this face's outward half-plane. A face on the other
    // side of the wall must not pull furniture through the wall centreline.
    if (dot(rawPosition, c.n) - dot(target.a, c.n) < -EPS || Math.abs(gap) > limit + EPS) continue;
    const projected = project(c, rounded);
    if (!touchesSegment(c, projected)) continue;
    candidates.push({ ...c, held, limit, gap, projected });
  }
  candidates.sort((a, b) => Number(b.held) - Number(a.held) || Math.abs(a.gap) - Math.abs(b.gap) || a.target.id.localeCompare(b.target.id));
  const first = candidates[0];
  if (!first) return result;
  let position = first.projected;
  const selected = [first];
  for (const other of candidates.slice(1)) {
    const corner = intersection(first, other, rawPosition);
    if (corner) { position = corner; selected.push(other); break; }
  }
  return {
    x: clean(position.x), y: clean(position.y),
    state: { targetIds: selected.map(c => c.target.id) },
    label: `贴墙 · ${[...new Set(selected.map(c => c.target.label))].join(' / ')}`,
    guides: selected.map(c => ({ a: { ...c.target.a }, b: { ...c.target.b }, label: c.target.label })),
  };
}

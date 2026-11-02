/** Measurement geometry uses the document's millimetres, independent of zoom. */
const EPSILON = 1e-7;
const isPoint = point => point && Number.isFinite(point.x) && Number.isFinite(point.y);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function measurementMetrics(start, end) {
  if (!isPoint(start) || !isPoint(end)) return { distance: 0, dx: 0, dy: 0 };
  const dx = Math.abs(end.x - start.x), dy = Math.abs(end.y - start.y);
  return { distance: Math.hypot(dx, dy), dx, dy };
}

/** Corners and edges of the visible 2D footprints; curved furniture uses its
 * named outer frame, while wall openings remove the corresponding wall face.
 */
export function buildMeasurementTargets(plan) {
  const targets = { points: [], segments: [] };
  const objects = (plan?.objects || []).filter(object => object.visible !== false);
  const openings = new Map();
  for (const object of objects) {
    if (!object.wallId || !['door', 'window'].includes(object.type)) continue;
    const list = openings.get(object.wallId) || [];
    list.push(object); openings.set(object.wallId, list);
  }
  for (const object of objects) {
    if (!isPoint(object) || !Number.isFinite(object.width) || !Number.isFinite(object.depth)) continue;
    const angle = (object.rotation || 0) * Math.PI / 180;
    const c = Math.cos(angle), s = Math.sin(angle), flip = object.mirrorY ? -1 : 1;
    const world = (x, y) => ({ x: object.x + c * x - s * y * flip, y: object.y + s * x + c * y * flip });
    const name = object.name || '对象';
    const rectangle = (left, right, halfDepth, wall = false) => {
      if (right - left <= EPSILON) return;
      const corners = [world(left, -halfDepth), world(right, -halfDepth), world(right, halfDepth), world(left, halfDepth)];
      for (let i = 0; i < 4; i++) {
        targets.points.push({ ...corners[i], label: `${name} · ${wall ? '墙角' : '外框角点'}` });
        targets.segments.push({ a: corners[i], b: corners[(i + 1) % 4], label: `${name} · ${wall ? '墙边' : '外框边缘'}` });
      }
    };
    const halfWidth = object.width / 2, halfDepth = object.depth / 2;
    if (object.type === 'wall') {
      const slots = (openings.get(object.id) || []).map(opening => {
        const centre = (opening.offset ?? halfWidth) - halfWidth;
        return { start: Math.max(-halfWidth, centre - opening.width / 2), end: Math.min(halfWidth, centre + opening.width / 2) };
      }).filter(slot => slot.end > slot.start).sort((a, b) => a.start - b.start);
      let cursor = -halfWidth;
      for (const slot of slots) {
        if (slot.start > cursor) rectangle(cursor, slot.start, halfDepth, true);
        cursor = Math.max(cursor, slot.end);
      }
      rectangle(cursor, halfWidth, halfDepth, true);
      for (const x of [-halfWidth, halfWidth]) targets.points.push({ ...world(x, 0), label: `${name} · 墙中心线端点` });
    } else {
      rectangle(-halfWidth, halfWidth, halfDepth);
    }
  }
  return targets;
}

function closestOnSegment(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, squaredLength = dx * dx + dy * dy;
  if (squaredLength <= EPSILON) return { x: a.x, y: a.y };
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / squaredLength));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

function pointOnLockedSegment(point, segment, fixedAxis) {
  if (!fixedAxis) return closestOnSegment(point, segment.a, segment.b);
  const { a, b } = segment;
  const span = b[fixedAxis] - a[fixedAxis];
  if (Math.abs(span) < EPSILON) {
    return Math.abs(a[fixedAxis] - point[fixedAxis]) < EPSILON ? closestOnSegment(point, a, b) : null;
  }
  const t = (point[fixedAxis] - a[fixedAxis]) / span;
  if (t < -EPSILON || t > 1 + EPSILON) return null;
  const result = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
  result[fixedAxis] = point[fixedAxis];
  return result;
}

/** toleranceMm is derived from a fixed screen-pixel radius by the viewport.
 * Shift constrains the direction before snapping; Alt can disable snapping
 * without removing that axis constraint. Free points keep sub-millimetre data.
 */
export function snapMeasurementPoint(point, targets, toleranceMm, options = {}) {
  if (!isPoint(point)) throw new Error('测量点坐标无效');
  const result = { x: point.x, y: point.y, snapLabel: '' };
  let fixedAxis = null;
  if (options.axisLock && isPoint(options.origin)) {
    const { origin } = options;
    fixedAxis = Math.abs(point.x - origin.x) >= Math.abs(point.y - origin.y) ? 'y' : 'x';
    result[fixedAxis] = origin[fixedAxis];
  }
  if (options.enabled === false) return result;
  const tolerance = Number.isFinite(toleranceMm) ? Math.max(0, toleranceMm) : 0;
  let nearest = null, bestDistance = tolerance + EPSILON;
  for (const target of targets?.points || []) {
    if (!isPoint(target) || (fixedAxis && Math.abs(target[fixedAxis] - result[fixedAxis]) > EPSILON)) continue;
    const delta = distance(result, target);
    if (delta < bestDistance) { nearest = target; bestDistance = delta; }
  }
  // An explicit corner/endpoint takes precedence over a nearby edge projection.
  if (!nearest) {
    for (const segment of targets?.segments || []) {
      if (!isPoint(segment.a) || !isPoint(segment.b)) continue;
      const projected = pointOnLockedSegment(result, segment, fixedAxis);
      if (!projected) continue;
      const delta = distance(result, projected);
      if (delta < bestDistance) { nearest = { ...projected, label: segment.label }; bestDistance = delta; }
    }
  }
  if (!nearest) return result;
  const snapped = { x: nearest.x, y: nearest.y, snapLabel: nearest.label || '几何吸附点' };
  if (fixedAxis) snapped[fixedAxis] = result[fixedAxis];
  return snapped;
}

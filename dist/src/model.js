/** Apartment plan model. All measurements are millimetres; rotations are clockwise. */
export const TYPES = Object.freeze({ wall: '墙体', door: '门 / 洞口', window: '窗', furniture: '家具 / 设备' });
export const KIND_LABELS = Object.freeze({ bed: '双人床', nightstand: '床头柜', wardrobe: '衣柜', cabinet: '储物柜', counter: '台面', sink: '水槽', stove: '灶台', fridge: '冰箱', toilet: '马桶', shower: '淋浴区', vanity: '浴室柜', basin: '洗手盆', 'dining-table': '餐桌', chair: '餐椅', sofa: '沙发', 'coffee-table': '茶几', rug: '地毯', armchair: '单椅', washer: '洗衣机', plant: '绿植', lamp: '台灯', bench: '长凳', 'side-table': '边几', opening: '敞口', single: '平开门', sliding: '推拉门', fixed: '固定窗' });

const clone = value => JSON.parse(JSON.stringify(value));
const EPS = 5;
const BALCONY_EDIT = 'remove-bedroom-balcony-partition-2026-11-02';
const LIVING_BALCONY_EDIT = 'remove-living-study-balcony-partitions-2026-11-02';
const BATH2_SLIDING_EDIT = 'correct-bathroom2-sliding-door-2026-11-02';
const HORIZONTAL_MIRROR_EDIT = 'mirror-plan-horizontal-2026-11-02';
const NORTH_BALCONY_EDIT = 'remove-bedroom1-north-balcony-partition-2026-11-02';
const deg = value => ((value % 360) + 360) % 360;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const GEOMETRY_FIELDS = ['x', 'y', 'width', 'depth', 'height', 'rotation', 'mirrorY', 'wallId', 'offset', 'sill', 'hinge', 'swing', 'kind'];
const equivalent = (field, a, b) => {
  if (field === 'wallId') return (a || null) === (b || null);
  if (typeof a === 'number' && typeof b === 'number' && Number.isFinite(a) && Number.isFinite(b)) {
    if (field === 'rotation') return Math.min(deg(a - b), deg(b - a)) < 1e-7;
    return Math.abs(a - b) < 1e-7;
  }
  return Object.is(a, b);
};
const freshId = prefix => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`}`;
const num = (value, label, min, max) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${label}必须是 ${min}～${max} 范围内的数字`);
  return value;
};

export function wallEndpoints(wall) {
  const angle = wall.rotation * Math.PI / 180;
  const dx = Math.cos(angle) * wall.width / 2;
  const dy = Math.sin(angle) * wall.width / 2;
  return { a: { x: wall.x - dx, y: wall.y - dy }, b: { x: wall.x + dx, y: wall.y + dy } };
}

function wallFromEndpoints(wall, a, b) {
  wall.x = (a.x + b.x) / 2;
  wall.y = (a.y + b.y) / 2;
  wall.width = distance(a, b);
  wall.rotation = deg(Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI);
}

function attachedGeometry(object, wall) {
  const half = object.width / 2;
  const offset = Math.max(half + 10, Math.min(wall.width - half - 10, object.offset ?? wall.width / 2));
  const { a } = wallEndpoints(wall);
  const angle = wall.rotation * Math.PI / 180;
  return { offset, x: a.x + Math.cos(angle) * offset, y: a.y + Math.sin(angle) * offset, rotation: wall.rotation, depth: wall.depth };
}

/** Compare final geometric consequences, including openings on connected walls. */
function assertLockedGeometryUnchanged(before, candidate) {
  const byId = new Map(candidate.objects.map(o => [o.id, o]));
  for (const original of before.objects) {
    if (!original.locked) continue;
    let proposed = byId.get(original.id);
    if (!proposed) throw new Error(`“${original.name}”已锁定，请先解锁后再修改`);
    if (['door', 'window'].includes(proposed.type) && proposed.wallId) {
      const wall = byId.get(proposed.wallId);
      if (wall?.type === 'wall') proposed = { ...proposed, ...attachedGeometry(proposed, wall) };
    }
    if (GEOMETRY_FIELDS.some(field => !equivalent(field, original[field], proposed[field]))) {
      throw new Error(`“${original.name}”已锁定，此操作会改变它的几何参数，请先解锁`);
    }
  }
}

/** Updates attached doors/windows, clamps their centres, and rejects overlapping openings. */
export function resolveOpenings(plan) {
  const walls = new Map(plan.objects.filter(o => o.type === 'wall').map(o => [o.id, o]));
  const openings = new Map();
  for (const object of plan.objects) {
    if (!['door', 'window'].includes(object.type) || !object.wallId) continue;
    const wall = walls.get(object.wallId);
    if (!wall) throw new Error(`“${object.name}”关联的墙体不存在`);
    if (object.width > wall.width - 20) throw new Error(`“${wall.name}”长度不足，无法容纳“${object.name}”`);
    Object.assign(object, attachedGeometry(object, wall));
    const list = openings.get(wall.id) || [];
    list.push(object);
    openings.set(wall.id, list);
  }
  for (const list of openings.values()) {
    list.sort((a, b) => a.offset - b.offset);
    for (let i = 1; i < list.length; i++) {
      if (list[i].offset - list[i].width / 2 < list[i - 1].offset + list[i - 1].width / 2 + 9.9) {
        throw new Error(`“${list[i - 1].name}”与“${list[i].name}”的洞口重叠，请调整位置或宽度`);
      }
    }
  }
  return plan;
}

function normalizeObject(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('对象数据格式不正确');
  if (typeof source.id !== 'string' || !source.id.trim() || source.id.length > 160) throw new Error('每个对象必须有有效的唯一 ID');
  if (!Object.hasOwn(TYPES, source.type)) throw new Error('发现不支持的对象类型');
  if (typeof source.name !== 'string' || !source.name.trim() || source.name.length > 200) throw new Error('对象名称不能为空，且不能超过 200 字');
  const object = {
    id: source.id, name: source.name.trim(), type: source.type,
    kind: typeof source.kind === 'string' ? source.kind.slice(0, 80) : (source.type === 'furniture' ? 'cabinet' : source.type),
    room: typeof source.room === 'string' ? source.room.slice(0, 100) : '未分区',
    x: num(source.x, 'X 坐标', -100000, 100000),
    y: num(source.y, 'Y 坐标', -100000, 100000),
    width: num(source.width, '长度 / 宽度', 10, 50000),
    depth: num(source.depth, '深度 / 厚度', 5, 50000),
    height: num(source.height ?? (source.type === 'wall' ? 2800 : 800), '高度', 1, 15000),
    rotation: deg(num(source.rotation ?? 0, '角度', -36000, 36000)),
    mirrorY: source.mirrorY === true,
    visible: source.visible !== false, locked: source.locked === true,
    estimated: source.estimated !== false,
  };
  if (typeof source.color === 'string' && /^#[0-9a-f]{6}$/i.test(source.color)) object.color = source.color;
  if (typeof source.note === 'string') object.note = source.note.slice(0, 1000);
  if (['door', 'window'].includes(object.type)) {
    if (source.wallId != null && source.wallId !== '') {
      if (typeof source.wallId !== 'string') throw new Error('所属墙体 ID 格式不正确');
      object.wallId = source.wallId;
    }
    object.offset = num(source.offset ?? 0, '沿墙距离', 0, 100000);
    object.hinge = source.hinge === 'right' ? 'right' : 'left';
    object.swing = source.swing === -1 ? -1 : 1;
    object.sill = num(source.sill ?? (object.type === 'window' ? 900 : 0), '窗台高度', 0, 10000);
  }
  return object;
}

/** Validate and clone untrusted imported JSON before putting it in the editor. */
export function validatePlan(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('请选择有效的户型 JSON 文件');
  if (input.version !== 1 || input.unit !== 'mm') throw new Error('仅支持 version: 1、unit: "mm" 的户型文件');
  if (!Array.isArray(input.objects) || input.objects.length > 2000) throw new Error('对象列表无效，最多支持 2000 个对象');
  const objects = input.objects.map(normalizeObject);
  const ids = new Set();
  for (const object of objects) {
    if (ids.has(object.id)) throw new Error(`发现重复的对象 ID：${object.id}`);
    ids.add(object.id);
  }
  if (input.rooms != null && (!Array.isArray(input.rooms) || input.rooms.length > 200)) throw new Error('房间分区列表无效');
  const rooms = (input.rooms || []).map((room, i) => {
    if (!room || typeof room !== 'object' || Array.isArray(room)) throw new Error(`第 ${i + 1} 个房间分区数据格式不正确`);
    return {
    id: typeof room.id === 'string' ? room.id.slice(0, 160) : `room-${i}`,
    name: typeof room.name === 'string' ? room.name.slice(0, 100) : '分区',
    x: num(room.x, '分区 X 坐标', -100000, 100000),
    y: num(room.y, '分区 Y 坐标', -100000, 100000),
    width: num(room.width, '分区宽度', 10, 50000),
    depth: num(room.depth, '分区深度', 10, 50000),
    color: typeof room.color === 'string' && /^#[0-9a-f]{6}$/i.test(room.color) ? room.color : '#f0ede5',
    };
  });
  const plan = { version: 1, title: typeof input.title === 'string' ? input.title.slice(0, 200) : '我的户型', unit: 'mm', objects, rooms };
  if (input.meta && typeof input.meta === 'object' && !Array.isArray(input.meta)) plan.meta = clone(input.meta);
  if (plan.meta) {
    const transform = plan.meta.referenceTransform;
    if (transform != null && (typeof transform !== 'object' || Array.isArray(transform) || ![1, -1].includes(transform.scaleX))) throw new Error('底图镜像参数无效');
    plan.meta.referenceTransform = { scaleX: transform?.scaleX ?? 1, offsetX: num(transform?.offsetX ?? 0, '底图偏移', -400000, 400000) };
  }
  resolveOpenings(plan);
  return plan;
}

/** Reflect the entire plan through the centre of its wall-centreline bounds.
 * R(180-angle) * local-depth reflection preserves handedness of doors/furniture.
 * Wall start/end identities remain stable, so attached opening offsets do too.
 */
export function mirrorPlanHorizontally(plan) {
  const candidate = validatePlan(plan);
  const walls = candidate.objects.filter(object => object.type === 'wall');
  let extents;
  if (walls.length) {
    extents = walls.flatMap(wall => {
      const { a, b } = wallEndpoints(wall);
      return [a.x, b.x];
    });
  } else if (candidate.objects.length) {
    extents = candidate.objects.flatMap(object => {
      const angle = object.rotation * Math.PI / 180;
      const half = (Math.abs(Math.cos(angle)) * object.width + Math.abs(Math.sin(angle)) * object.depth) / 2;
      return [object.x - half, object.x + half];
    });
  } else {
    extents = candidate.rooms.flatMap(room => [room.x - room.width / 2, room.x + room.width / 2]);
  }
  if (!extents.length) return plan;
  const axisSum = Math.min(...extents) + Math.max(...extents);
  for (const object of candidate.objects) {
    object.x = axisSum - object.x;
    object.rotation = deg(180 - object.rotation);
    object.mirrorY = !object.mirrorY;
  }
  for (const room of candidate.rooms) room.x = axisSum - room.x;
  candidate.meta ??= {};
  const reference = candidate.meta.referenceTransform ?? { scaleX: 1, offsetX: 0 };
  candidate.meta.referenceTransform = { scaleX: -reference.scaleX, offsetX: axisSum - reference.offsetX };
  // Whole-plan reflection includes locked objects but preserves their lock flags.
  // Commit only after all reflected coordinates and attached openings validate.
  const checked = validatePlan(candidate);
  plan.objects = checked.objects;
  plan.rooms = checked.rooms;
  plan.meta = checked.meta;
  return plan;
}

/** Atomic model transaction. A rejected geometric change leaves the input untouched. */
export function updateObject(plan, id, patch, options = {}) {
  const original = plan.objects.find(o => o.id === id);
  if (!original) throw new Error('找不到这个对象');
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('修改参数无效');
  if (Object.hasOwn(patch, 'id') && patch.id !== id) throw new Error('对象 ID 不可修改');
  if (Object.hasOwn(patch, 'type') && patch.type !== original.type) throw new Error('对象类型不可修改');
  if (original.locked && GEOMETRY_FIELDS.some(field => Object.hasOwn(patch, field) && !equivalent(field, original[field], patch[field]))) {
    throw new Error(`“${original.name}”已锁定，请先解锁后再修改几何参数`);
  }
  const next = clone(plan);
  const object = next.objects.find(o => o.id === id);
  Object.assign(object, patch);
  if (object.type === 'wall') {
    const oldPoints = wallEndpoints(original);
    const anchor = options.anchor || 'center';
    if (['start', 'end'].includes(anchor) && !Object.hasOwn(patch, 'x') && !Object.hasOwn(patch, 'y')) {
      const angle = object.rotation * Math.PI / 180;
      const sign = anchor === 'start' ? 1 : -1;
      const point = anchor === 'start' ? oldPoints.a : oldPoints.b;
      object.x = point.x + sign * Math.cos(angle) * object.width / 2;
      object.y = point.y + sign * Math.sin(angle) * object.width / 2;
    }
    const newPoints = wallEndpoints(object);
    const movedA = distance(oldPoints.a, newPoints.a) > 1e-7;
    const movedB = distance(oldPoints.b, newPoints.b) > 1e-7;
    if (options.linked !== false && (movedA || movedB)) {
      for (const neighbour of next.objects) {
        if (neighbour.type !== 'wall' || neighbour.id === id) continue;
        const points = wallEndpoints(neighbour);
        let changed = false;
        for (const end of ['a', 'b']) {
          if (movedA && distance(points[end], oldPoints.a) <= EPS) { points[end] = { ...newPoints.a }; changed = true; }
          else if (movedB && distance(points[end], oldPoints.b) <= EPS) { points[end] = { ...newPoints.b }; changed = true; }
        }
        if (changed) wallFromEndpoints(neighbour, points.a, points.b);
      }
    }
  } else if (['door', 'window'].includes(object.type) && object.wallId) {
    const wall = next.objects.find(o => o.id === object.wallId && o.type === 'wall');
    if (!wall) throw new Error('请选择有效的所属墙体');
    if (Object.hasOwn(patch, 'rotation') && Math.abs(deg(patch.rotation) - deg(wall.rotation)) > 0.01) throw new Error('附墙门窗跟随墙体方向；自由旋转前请取消所属墙体');
    if (Object.hasOwn(patch, 'x') || Object.hasOwn(patch, 'y')) {
      const { a } = wallEndpoints(wall);
      const angle = wall.rotation * Math.PI / 180;
      object.offset = (object.x - a.x) * Math.cos(angle) + (object.y - a.y) * Math.sin(angle);
      object.offset = Math.max(0, object.offset);
    } else if (Object.hasOwn(patch, 'wallId') && patch.wallId !== original.wallId && !Object.hasOwn(patch, 'offset')) {
      object.offset = wall.width / 2;
    }
  }
  assertLockedGeometryUnchanged(plan, next);
  const checked = validatePlan(next);
  assertLockedGeometryUnchanged(plan, checked);
  plan.objects = checked.objects;
  return plan.objects.find(o => o.id === id);
}

export function removeObject(plan, id) {
  const object = plan.objects.find(o => o.id === id);
  if (!object) return [];
  const removed = plan.objects.filter(o => o.id === id || (object.type === 'wall' && o.wallId === id));
  const removedIds = new Set(removed.map(o => o.id));
  plan.objects = plan.objects.filter(o => !removedIds.has(o.id));
  return removed;
}

export function duplicateObject(plan, id) {
  const source = plan.objects.find(o => o.id === id);
  if (!source) throw new Error('找不到要复制的对象');
  const object = { ...clone(source), id: freshId(source.type), name: `${source.name} 副本`, locked: false };
  const candidate = clone(plan);
  if (object.wallId) {
    const wall = plan.objects.find(o => o.id === object.wallId);
    const max = wall.width - object.width / 2 - 10;
    const offsets = [source.offset + source.width + 100, source.offset - source.width - 100];
    for (let offset = object.width / 2 + 10; offset <= max; offset += 50) offsets.push(offset);
    for (const offset of offsets) {
      if (offset < object.width / 2 + 10 || offset > max) continue;
      object.offset = offset;
      candidate.objects = [...clone(plan.objects), object];
      try {
        const checked = validatePlan(candidate);
        plan.objects = checked.objects;
        return plan.objects.find(o => o.id === object.id);
      } catch { /* Try another free section of the wall. */ }
    }
    throw new Error('这面墙没有足够空间复制门窗，请先调整墙体或洞口');
  }
  object.x += 300;
  object.y += 300;
  candidate.objects.push(object);
  const checked = validatePlan(candidate);
  plan.objects = checked.objects;
  return plan.objects.find(o => o.id === object.id);
}

export function createObject(type = 'furniture', kind) {
  if (!Object.hasOwn(TYPES, type)) throw new Error('不支持的对象类型');
  const defaults = {
    wall: { kind: 'wall', width: 2000, depth: 180, height: 2800, color: '#c9c8be' },
    door: { kind: 'single', width: 850, depth: 180, height: 2100, color: '#c6a981', offset: 0, hinge: 'left', swing: 1, sill: 0 },
    window: { kind: 'fixed', width: 1200, depth: 180, height: 1400, color: '#a8c4c8', offset: 0, hinge: 'left', swing: 1, sill: 900 },
    furniture: { kind: kind || 'cabinet', width: 1200, depth: 500, height: 850, color: '#cdb696' },
  };
  const object = { id: freshId(type), name: `新${KIND_LABELS[kind] || TYPES[type]}`, type, room: '未分区', x: 4900, y: 4500, rotation: 0, mirrorY: false, visible: true, locked: false, estimated: true, ...defaults[type] };
  if (kind) object.kind = kind;
  if (type === 'furniture') {
    const sizes = { bed: [1600, 2000, 550], sofa: [2100, 850, 780], chair: [450, 480, 800], 'dining-table': [850, 1700, 750], 'coffee-table': [1000, 550, 420], armchair: [700, 750, 800], plant: [350, 350, 900], rug: [2400, 1800, 15], wardrobe: [1600, 600, 2200], toilet: [420, 680, 780], washer: [600, 600, 850], sink: [650, 450, 160], shower: [900, 900, 80] };
    if (sizes[object.kind]) [object.width, object.depth, object.height] = sizes[object.kind];
  }
  return object;
}

/** Apply a published edit once to this reference plan, preserving unrelated edits. */
export function applyPublishedPlanEdits(plan) {
  if (plan.meta?.source !== '极简公寓建筑平面图.png') return false;
  const candidate = validatePlan(plan);
  const applied = Array.isArray(candidate.meta.appliedEdits) ? candidate.meta.appliedEdits : [];
  const edits = [
    { key: BALCONY_EDIT, walls: ['wall-bedroom2-balcony'], doors: ['door-balcony-west'] },
    { key: LIVING_BALCONY_EDIT, walls: ['wall-living-balcony', 'wall-study-balcony'], doors: ['door-balcony-center', 'door-balcony-east'] },
    { key: NORTH_BALCONY_EDIT, walls: ['wall-north-balcony'], doors: ['window-bedroom1'], removeAttached: true },
  ];
  const pending = edits.filter(edit => !applied.includes(edit.key));
  const correctBathroomDoor = !applied.includes(BATH2_SLIDING_EDIT);
  const mirrorPlan = !applied.includes(HORIZONTAL_MIRROR_EDIT);
  if (!pending.length && !correctBathroomDoor && !mirrorPlan) return false;
  for (const edit of pending) {
    const removedIds = new Set([...edit.walls, ...edit.doors]);
    candidate.objects = candidate.objects.filter(o => !removedIds.has(o.id) && !(edit.removeAttached && ['door', 'window'].includes(o.type) && edit.walls.includes(o.wallId)));
    // Earlier edits preserve extra openings; the north partition is fully cleared.
    for (const object of candidate.objects) {
      if (edit.walls.includes(object.wallId)) delete object.wallId;
    }
  }
  if (correctBathroomDoor) {
    const door = candidate.objects.find(o => o.id === 'door-bath2');
    const wall = candidate.objects.find(o => o.id === 'wall-bath2-south' && o.type === 'wall');
    if (door) {
      door.kind = 'sliding';
      if (door.name === '卫生间二房门') door.name = '卫生间二推拉门';
      if (wall) {
        door.wallId = wall.id;
        door.offset = wall.width * 1850 / 3400;
        Object.assign(door, attachedGeometry(door, wall));
      }
    }
  }
  if (mirrorPlan) mirrorPlanHorizontally(candidate);
  candidate.meta.appliedEdits = [...applied, ...pending.map(edit => edit.key), ...(correctBathroomDoor ? [BATH2_SLIDING_EDIT] : []), ...(mirrorPlan ? [HORIZONTAL_MIRROR_EDIT] : [])];
  Object.assign(plan, candidate);
  return true;
}

export function createInitialPlan() {
  const objects = [];
  const rooms = [];
  const wall = (id, name, ax, ay, bx, by, depth = 180, room = '建筑结构') => {
    const object = { id, name, type: 'wall', kind: 'wall', room, x: 0, y: 0, width: 1, depth, height: 2800, rotation: 0, visible: true, locked: false, estimated: true, color: '#c9c8be', note: '位置依据原图尺寸链重建；墙厚及高度为可编辑估算值。' };
    wallFromEndpoints(object, { x: ax, y: ay }, { x: bx, y: by });
    objects.push(object);
    return object;
  };
  const opening = (id, name, type, wallId, offset, width, room, extra = {}) => {
    objects.push({ id, name, type, kind: type === 'door' ? 'single' : 'fixed', room, x: 0, y: 0, width, depth: 180, height: type === 'door' ? 2100 : 1500, rotation: 0, wallId, offset, hinge: 'left', swing: 1, sill: type === 'window' ? 850 : 0, visible: true, locked: false, estimated: true, color: type === 'window' ? '#acc5c9' : '#c5aa86', ...extra });
  };
  const furniture = (id, name, kind, room, x, y, width, depth, height, rotation = 0, color = '#cfb99c') => objects.push({ id, name, type: 'furniture', kind, room, x, y, width, depth, height, rotation, color, visible: true, locked: false, estimated: true });
  const zone = (id, name, x, y, width, depth, color) => rooms.push({ id, name, x, y, width, depth, color });

  // Exterior dimensions use the supplied annotation chains (bottom 9800; height 10300).
  wall('wall-north', '北侧外墙', 0, 0, 8400, 0, 240);
  wall('wall-west', '西侧外墙', 0, 0, 0, 10300, 240);
  wall('wall-east-upper', '东侧外墙 · 入户段', 8400, 0, 8400, 6350, 240);
  wall('wall-east-step', '东侧外墙 · 转折段', 8400, 6350, 9800, 6350, 240);
  wall('wall-east-lower', '东侧外墙 · 休闲区', 9800, 6350, 9800, 10300, 240);
  wall('wall-south', '南侧外墙', 0, 10300, 9800, 10300, 240);
  wall('wall-left-kitchen', '卧室一与厨房隔墙', 3400, 0, 3400, 2600, 220, '卧室一');
  wall('wall-bedroom1-door', '卧室一门侧墙', 3400, 2600, 3400, 3900, 180, '卧室一');
  wall('wall-bath2-east', '卫生间二东侧隔墙', 3400, 3900, 3400, 5600, 180, '卫生间二');
  wall('wall-bedroom2-east', '卧室二东侧隔墙', 3400, 5600, 3400, 8800, 220, '卧室二');
  wall('wall-balcony-west-divider', '南阳台西分隔墙', 3400, 8800, 3400, 10300, 220, '南阳台');
  wall('wall-bedroom1-south', '卧室一南侧隔墙', 0, 3900, 3400, 3900, 180, '卧室一');
  wall('wall-bath2-south', '卫生间二南侧隔墙', 0, 5600, 3400, 5600, 180, '卫生间二');
  wall('wall-balcony-east-divider', '南阳台东分隔墙', 7100, 8800, 7100, 10300, 220, '南阳台');
  wall('wall-kitchen-bath', '厨房与卫生间一隔墙', 6650, 0, 6650, 2600, 160, '厨房');
  wall('wall-kitchen-south', '厨房南侧开口墙', 3400, 2600, 6650, 2600, 160, '厨房');
  wall('wall-bath1-south', '卫生间一门侧墙', 6650, 2600, 8400, 2600, 160, '卫生间一');
  wall('wall-utility-north', '家政间北侧隔墙', 7100, 4350, 8400, 4350, 200, '家政间');
  wall('wall-utility-west', '家政间门侧墙', 7100, 4350, 7100, 5950, 180, '家政间');
  wall('wall-utility-south', '家政间南侧隔墙', 7100, 5950, 8400, 5950, 180, '家政间');
  wall('wall-study-west', '休闲区西侧隔墙', 7100, 5950, 7100, 8800, 220, '休闲区');

  opening('window-north-balcony', '北阳台外窗', 'window', 'wall-north', 1650, 2800, '北阳台', { sill: 650, height: 1900 });
  opening('window-kitchen', '厨房采光窗', 'window', 'wall-north', 5050, 1550, '厨房', { sill: 1050, height: 1300 });
  opening('window-bath1', '卫生间一外窗', 'window', 'wall-north', 7350, 700, '卫生间一', { sill: 1300, height: 1000 });
  opening('window-bath2', '卫生间二外窗', 'window', 'wall-west', 4700, 850, '卫生间二', { sill: 1200, height: 1100 });
  opening('window-south-west', '南阳台西窗', 'window', 'wall-south', 1650, 2700, '南阳台', { sill: 750, height: 1800 });
  opening('window-south-center', '南阳台中窗', 'window', 'wall-south', 5250, 2800, '南阳台', { sill: 750, height: 1800 });
  opening('window-south-east', '南阳台东窗', 'window', 'wall-south', 8450, 2100, '南阳台', { sill: 750, height: 1800 });
  opening('door-entry', '入户门', 'door', 'wall-east-upper', 3350, 1100, '玄关', { hinge: 'right', swing: 1 });
  opening('door-bedroom1', '卧室一房门', 'door', 'wall-bedroom1-door', 650, 900, '卧室一', { hinge: 'right', swing: 1 });
  opening('door-kitchen', '厨房敞口', 'door', 'wall-kitchen-south', 1750, 2200, '厨房', { kind: 'opening', height: 2400 });
  opening('door-bath1', '卫生间一房门', 'door', 'wall-bath1-south', 580, 850, '卫生间一', { hinge: 'left', swing: -1 });
  opening('door-bath2', '卫生间二推拉门', 'door', 'wall-bath2-south', 1850, 900, '卫生间二', { kind: 'sliding' });
  opening('door-bedroom2', '卧室二房门', 'door', 'wall-bedroom2-east', 600, 950, '卧室二', { hinge: 'left', swing: 1 });
  opening('door-utility', '家政间房门', 'door', 'wall-utility-west', 1050, 800, '家政间', { hinge: 'right', swing: -1 });
  opening('door-study', '休闲区房门', 'door', 'wall-study-west', 600, 900, '休闲区', { hinge: 'left', swing: -1 });

  zone('room-north-balcony', '北阳台', 1700, 400, 3160, 560, '#edece2');
  zone('room-bedroom1', '卧室一', 1700, 2350, 3160, 2860, '#eee6da');
  zone('room-kitchen', '厨房', 5025, 1300, 3030, 2360, '#eeede6');
  zone('room-bath1', '卫生间一', 7525, 1300, 1510, 2360, '#e3ebe8');
  zone('room-bath2', '卫生间二', 1700, 4750, 3160, 1460, '#e3ebe8');
  zone('room-dining', '餐厅', 5230, 4250, 3440, 2960, '#f2eee5');
  zone('room-entry', '玄关', 7530, 3450, 1500, 1430, '#f2eee5');
  zone('room-bedroom2', '卧室二', 1700, 7200, 3160, 2960, '#eee6da');
  zone('room-living', '客厅', 5250, 7350, 3460, 2660, '#f0e9de');
  zone('room-utility', '家政间', 7750, 5150, 1060, 1360, '#e7e9e1');
  zone('room-study', '休闲区', 8450, 7575, 2460, 2210, '#eee8df');
  zone('room-balcony-west', '南阳台 · 西', 1700, 9550, 3160, 1260, '#e5e9df');
  zone('room-balcony-center', '南阳台 · 中', 5250, 9550, 3460, 1260, '#e5e9df');
  zone('room-balcony-east', '南阳台 · 东', 8450, 9550, 2460, 1260, '#e5e9df');

  furniture('north-bench', '北阳台长凳', 'bench', '北阳台', 1650, 400, 2850, 420, 440, 0, '#c9b598');
  furniture('bedroom1-bed', '卧室一双人床', 'bed', '卧室一', 1210, 2200, 1500, 2000, 550, 270, '#ded4c3');
  furniture('bedroom1-nightstand-a', '卧室一北床头柜', 'nightstand', '卧室一', 430, 1210, 430, 420, 480);
  furniture('bedroom1-nightstand-b', '卧室一南床头柜', 'nightstand', '卧室一', 430, 3190, 430, 420, 480);
  furniture('bedroom1-lamp-a', '卧室一北床头灯', 'lamp', '卧室一', 430, 1210, 230, 230, 820, 0, '#ece6d9');
  furniture('bedroom1-lamp-b', '卧室一南床头灯', 'lamp', '卧室一', 430, 3190, 230, 230, 820, 0, '#ece6d9');
  furniture('bedroom1-wardrobe', '卧室一衣柜', 'wardrobe', '卧室一', 850, 3560, 1450, 500, 2200, 0, '#c5b89f');
  furniture('kitchen-counter-west', '厨房西侧操作台', 'counter', '厨房', 3810, 1530, 600, 1760, 880, 0, '#d4c9b7');
  furniture('kitchen-counter-north', '厨房北侧操作台', 'counter', '厨房', 5020, 420, 2470, 600, 880, 0, '#d4c9b7');
  furniture('kitchen-sink', '厨房水槽', 'sink', '厨房', 5020, 420, 650, 440, 930, 0, '#d5dddd');
  furniture('kitchen-stove', '厨房双眼灶', 'stove', '厨房', 3810, 1580, 530, 720, 930, 0, '#5f6863');
  furniture('kitchen-fridge', '厨房冰箱', 'fridge', '厨房', 6190, 2200, 650, 650, 1800, 0, '#e2e4de');
  furniture('kitchen-wall-cabinet', '厨房北侧收纳柜', 'cabinet', '厨房', 3840, 460, 520, 520, 1500, 0, '#d0c3ad');
  furniture('bath1-shower', '卫生间一淋浴区', 'shower', '卫生间一', 7530, 570, 1480, 880, 80, 0, '#c8d9d6');
  furniture('bath1-toilet', '卫生间一马桶', 'toilet', '卫生间一', 7890, 1510, 410, 680, 780, 90, '#f2f0e9');
  furniture('bath1-vanity', '卫生间一浴室柜', 'vanity', '卫生间一', 8000, 2200, 620, 620, 850, 0, '#c9bcaa');
  furniture('bath1-basin', '卫生间一洗手盆', 'basin', '卫生间一', 8000, 2200, 440, 420, 930, 90, '#f4f2eb');
  furniture('bath1-cabinet', '卫生间一置物柜', 'cabinet', '卫生间一', 8130, 460, 280, 550, 1200, 0, '#d5d6c9');
  furniture('bath2-shower', '卫生间二淋浴区', 'shower', '卫生间二', 620, 4720, 1000, 1320, 80, 0, '#c8d9d6');
  furniture('bath2-vanity', '卫生间二浴室柜', 'vanity', '卫生间二', 2180, 4240, 2150, 480, 850, 0, '#c9bcaa');
  furniture('bath2-basin', '卫生间二洗手盆', 'basin', '卫生间二', 1830, 4240, 550, 380, 930, 0, '#f4f2eb');
  furniture('bath2-toilet', '卫生间二马桶', 'toilet', '卫生间二', 2910, 5050, 420, 680, 780, 90, '#f2f0e9');
  furniture('bath2-cabinet', '卫生间二收纳柜', 'cabinet', '卫生间二', 520, 4200, 650, 350, 900, 0, '#d5d6c9');
  furniture('dining-table', '餐厅六人餐桌', 'dining-table', '餐厅', 5200, 4550, 850, 1850, 750, 0, '#c8af8c');
  for (let row = 0; row < 3; row++) {
    furniture(`dining-chair-west-${row + 1}`, `餐椅 ${row + 1} · 西侧`, 'chair', '餐厅', 4540, 3930 + row * 620, 430, 460, 800, 270, '#929f8e');
    furniture(`dining-chair-east-${row + 1}`, `餐椅 ${row + 4} · 东侧`, 'chair', '餐厅', 5860, 3930 + row * 620, 430, 460, 800, 90, '#929f8e');
  }
  furniture('bedroom2-bed', '卧室二双人床', 'bed', '卧室二', 1230, 7410, 1600, 2100, 550, 270, '#d5d8c9');
  furniture('bedroom2-nightstand-a', '卧室二北床头柜', 'nightstand', '卧室二', 440, 6360, 440, 430, 480);
  furniture('bedroom2-nightstand-b', '卧室二南床头柜', 'nightstand', '卧室二', 440, 8460, 440, 430, 480);
  furniture('bedroom2-lamp-a', '卧室二北床头灯', 'lamp', '卧室二', 440, 6360, 230, 230, 820, 0, '#ece6d9');
  furniture('bedroom2-lamp-b', '卧室二南床头灯', 'lamp', '卧室二', 440, 8460, 230, 230, 820, 0, '#ece6d9');
  furniture('bedroom2-wardrobe', '卧室二衣柜', 'wardrobe', '卧室二', 3010, 7470, 560, 1780, 2200, 0, '#c5b89f');
  furniture('living-rug', '客厅地毯', 'rug', '客厅', 4850, 7600, 2500, 1900, 15, 0, '#d9d6c7');
  furniture('living-sofa', '客厅双人沙发', 'sofa', '客厅', 3950, 7600, 1800, 850, 780, 270, '#adb8a3');
  furniture('living-coffee', '客厅椭圆茶几', 'coffee-table', '客厅', 4700, 7350, 750, 480, 420, 90, '#b69c79');
  furniture('utility-counter', '家政间操作台', 'counter', '家政间', 7740, 4690, 1070, 500, 900, 0, '#d4c9b7');
  furniture('utility-cabinet', '家政间储物柜', 'cabinet', '家政间', 7500, 5370, 500, 900, 1900, 0, '#c5b89f');
  furniture('utility-washer', '家政间洗衣机', 'washer', '家政间', 8010, 5550, 650, 650, 850, 0, '#e4e7df');
  furniture('study-sofa', '休闲区靠墙沙发', 'sofa', '休闲区', 9300, 7600, 1450, 650, 750, 90, '#c6beb0');
  furniture('study-chair-north', '休闲区北侧单椅', 'armchair', '休闲区', 8600, 7550, 570, 600, 720, 210, '#b3bda6');
  furniture('study-chair-south', '休闲区南侧单椅', 'armchair', '休闲区', 8530, 8260, 570, 600, 720, 330, '#b3bda6');
  furniture('study-side-table-north', '休闲区北侧边几', 'side-table', '休闲区', 9270, 6730, 330, 330, 500, 0, '#cbb594');
  furniture('study-side-table-south', '休闲区南侧边几', 'side-table', '休闲区', 9290, 8500, 330, 330, 500, 0, '#cbb594');
  furniture('study-plant-north', '休闲区北侧绿植', 'plant', '休闲区', 9270, 6730, 250, 250, 850, 0, '#71856d');
  furniture('study-plant-south', '休闲区南侧绿植', 'plant', '休闲区', 9290, 8500, 250, 250, 850, 0, '#71856d');

  const plan = validatePlan({ version: 1, title: '极简公寓 · 可编辑户型', unit: 'mm', objects, rooms, meta: {
    source: '极简公寓建筑平面图.png',
    appliedEdits: [BALCONY_EDIT, LIVING_BALCONY_EDIT, BATH2_SLIDING_EDIT, NORTH_BALCONY_EDIT],
    description: '按用户提供的平面图人工重建。原图尺寸链用于布局比例，未标注的墙厚、家具及门窗尺寸为估算值。',
    sourceDimensions: { north: [3400, 3250, 1750], south: [3400, 3700, 2700], west: [800, 3100, 1700, 3200, 1500], east: [2600, 1950, 1400, 400, 2450, 1500] },
    bounds: { width: 9800, depth: 10300 },
    referenceImage: './assets/reference.png',
  } });
  applyPublishedPlanEdits(plan);
  return plan;
}

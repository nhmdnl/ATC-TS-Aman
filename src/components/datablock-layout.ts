/**
 * Leader-line placement for radar datablocks.
 *
 * Every tag used to hang off a fixed `+16 / -16` offset from its blip, so two
 * aircraft close together on the scope drew their tags on top of each other
 * and neither one stayed readable. This picks a direction per tag instead:
 * candidates are tried in preference order and the first that clears the tags
 * already placed — and every other blip — wins.
 *
 * Pure geometry: no Pixi, no aircraft types, so it unit-tests under the node
 * environment the same way the engine modules do.
 */

/** Monospace advance and line box of the 10 px 'SF Mono' datablock text. */
export const TAG_CHAR_W = 6
export const TAG_LINE_H = 12

/** Half-extent of an aircraft blip. Tags keep clear of other traffic symbols. */
export const BLIP_HALF = 8

/** Gap kept between a placed tag and anything it could collide with. */
export const TAG_PADDING = 2

/**
 * Leader directions in preference order. NE is first because it is the
 * historical fixed offset — an uncontested tag therefore lands where it
 * always has, and only crowded ones move.
 */
export const LEADER_DIRECTIONS: ReadonlyArray<{ readonly ux: number; readonly uy: number }> = [
  { ux: 1, uy: -1 },  // NE (the original fixed offset)
  { ux: 1, uy: 0 },   // E
  { ux: 1, uy: 1 },   // SE
  { ux: 0, uy: -1 },  // N
  { ux: 0, uy: 1 },   // S
  { ux: -1, uy: -1 }, // NW
  { ux: -1, uy: 0 },  // W
  { ux: -1, uy: 1 },  // SW
]

/**
 * Leader lengths, shortest first: every direction is tried on a ring before
 * any is tried on the next one out. The third ring exists for tight clusters
 * — eight tags around traffic packed into ~30 px do not all fit on the inner
 * two, and a longer leader beats an unreadable overlap.
 */
export const LEADER_RADII: ReadonlyArray<number> = [16, 30, 46]

export const CANDIDATE_COUNT = LEADER_DIRECTIONS.length * LEADER_RADII.length

export interface TagInput {
  readonly id: string
  /** Blip position in screen pixels. */
  readonly x: number
  readonly y: number
  /** Full multi-line datablock text, used for sizing. */
  readonly label: string
  /** Higher places first, so alerting traffic claims the uncontested slot. */
  readonly priority: number
}

export interface TagPlacement {
  /** Where the leader line terminates. */
  readonly anchorX: number
  readonly anchorY: number
  /** Top-left of the text box. */
  readonly textX: number
  readonly textY: number
  /** Index into the candidate list, for frame-to-frame hysteresis. */
  readonly candidate: number
  /** False when every candidate collided and the least-bad one was taken. */
  readonly clear: boolean
}

interface Rect {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/** Bounding box of a rendered datablock, from its text alone. */
export function measureTag(label: string): { w: number; h: number } {
  const lines = label.split('\n')
  let longest = 0
  for (const line of lines) longest = Math.max(longest, line.length)
  return { w: longest * TAG_CHAR_W, h: lines.length * TAG_LINE_H }
}

/**
 * Geometry of one candidate slot. The box's near corner sits at the anchor so
 * the tag always extends away from the blip; on an axis the direction does not
 * favour (ux or uy of 0) the box is centred instead.
 */
export function candidateGeometry(
  x: number,
  y: number,
  w: number,
  h: number,
  index: number,
): { anchorX: number; anchorY: number; textX: number; textY: number } {
  const dir = LEADER_DIRECTIONS[index % LEADER_DIRECTIONS.length]
  const radius = LEADER_RADII[Math.floor(index / LEADER_DIRECTIONS.length)]
  const anchorX = x + dir.ux * radius
  const anchorY = y + dir.uy * radius
  const textX = dir.ux < 0 ? anchorX - w : dir.ux > 0 ? anchorX : anchorX - w / 2
  const textY = dir.uy < 0 ? anchorY - h : dir.uy > 0 ? anchorY : anchorY - h / 2
  return { anchorX, anchorY, textX, textY }
}

function intersectArea(a: Rect, b: Rect): number {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return ox > 0 && oy > 0 ? ox * oy : 0
}

/**
 * Assigns each tag a slot that avoids the tags already placed and every blip
 * on the scope.
 *
 * `previous` carries the last frame's candidate per id: that slot is retried
 * first, so a tag which is still clear does not hop between directions on
 * every frame. Pass the returned candidates back in on the next frame.
 */
export function layoutDatablocks(
  items: readonly TagInput[],
  previous?: ReadonlyMap<string, number>,
): Map<string, TagPlacement> {
  // Highest priority first, id as the tiebreak so the result is deterministic
  // and independent of iteration order.
  const order = [...items].sort(
    (a, b) => b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )

  // Every blip is an obstacle, including ones whose own tag is not drawn.
  const blips = items.map(it => ({
    id: it.id,
    rect: { x: it.x - BLIP_HALF, y: it.y - BLIP_HALF, w: BLIP_HALF * 2, h: BLIP_HALF * 2 },
  }))

  const placed: Rect[] = []
  const out = new Map<string, TagPlacement>()

  for (const item of order) {
    const { w, h } = measureTag(item.label)

    // Hysteresis: last frame's slot leads, then the standard preference order.
    const prev = previous?.get(item.id)
    const tryOrder: number[] = []
    if (prev != null && prev >= 0 && prev < CANDIDATE_COUNT) tryOrder.push(prev)
    for (let i = 0; i < CANDIDATE_COUNT; i++) if (i !== prev) tryOrder.push(i)

    let chosen = -1
    let bestIndex = tryOrder[0]
    let bestScore = Infinity

    for (const i of tryOrder) {
      const geom = candidateGeometry(item.x, item.y, w, h, i)
      const box: Rect = {
        x: geom.textX - TAG_PADDING,
        y: geom.textY - TAG_PADDING,
        w: w + TAG_PADDING * 2,
        h: h + TAG_PADDING * 2,
      }

      let score = 0
      for (const rect of placed) score += intersectArea(box, rect)
      for (const blip of blips) {
        if (blip.id === item.id) continue // a tag may sit near its own blip
        score += intersectArea(box, blip.rect)
      }

      if (score === 0) {
        chosen = i
        break
      }
      if (score < bestScore) {
        bestScore = score
        bestIndex = i
      }
    }

    const index = chosen >= 0 ? chosen : bestIndex
    const geom = candidateGeometry(item.x, item.y, w, h, index)
    placed.push({ x: geom.textX, y: geom.textY, w, h })
    out.set(item.id, {
      anchorX: geom.anchorX,
      anchorY: geom.anchorY,
      textX: geom.textX,
      textY: geom.textY,
      candidate: index,
      clear: chosen >= 0,
    })
  }

  return out
}

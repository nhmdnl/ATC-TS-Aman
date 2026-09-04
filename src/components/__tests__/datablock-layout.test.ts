import { describe, it, expect } from 'vitest'
import {
  layoutDatablocks,
  measureTag,
  candidateGeometry,
  CANDIDATE_COUNT,
  TAG_CHAR_W,
  TAG_LINE_H,
  type TagInput,
  type TagPlacement,
} from '../datablock-layout'

/** Text box of a placement, given the label it was sized from. */
function boxOf(p: TagPlacement, label: string): { x: number; y: number; w: number; h: number } {
  const { w, h } = measureTag(label)
  return { x: p.textX, y: p.textY, w, h }
}

function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

const PDB = 'ABC123\n120 250'

function ac(id: string, x: number, y: number, priority = 0, label = PDB): TagInput {
  return { id, x, y, label, priority }
}

describe('measureTag', () => {
  it('sizes from the longest line and the line count', () => {
    expect(measureTag('ABCD')).toEqual({ w: 4 * TAG_CHAR_W, h: TAG_LINE_H })
    expect(measureTag('AB\nABCDE\nA')).toEqual({ w: 5 * TAG_CHAR_W, h: 3 * TAG_LINE_H })
  })
})

describe('layoutDatablocks', () => {
  it('leaves an uncontested tag on the historical NE offset', () => {
    const placements = layoutDatablocks([ac('A', 100, 100)])
    const p = placements.get('A')!

    // The pre-fix renderer used a fixed +16 / -16 anchor; lone traffic must
    // not move as a result of this change.
    expect(p.candidate).toBe(0)
    expect(p.anchorX).toBe(116)
    expect(p.anchorY).toBe(84)
    expect(p.clear).toBe(true)
  })

  it('separates two tags that would otherwise be drawn on top of each other', () => {
    const items = [ac('A', 100, 100), ac('B', 100, 100)]
    const placements = layoutDatablocks(items)

    const a = placements.get('A')!
    const b = placements.get('B')!

    expect(a.candidate).not.toBe(b.candidate)
    expect(overlaps(boxOf(a, PDB), boxOf(b, PDB))).toBe(false)
  })

  it('keeps every tag clear of every other in a dense cluster', () => {
    // Eight aircraft packed inside a ~30 px box — worst case on a zoomed-out
    // scope, where the old fixed anchor stacked all eight labels.
    const items: TagInput[] = [
      ac('AAA1', 200, 200), ac('BBB2', 210, 205), ac('CCC3', 195, 212),
      ac('DDD4', 220, 198), ac('EEE5', 205, 220), ac('FFF6', 190, 195),
      ac('GGG7', 215, 215), ac('HHH8', 200, 190),
    ]
    const placements = layoutDatablocks(items)

    expect(placements.size).toBe(items.length)
    for (const item of items) {
      expect(placements.get(item.id)!.clear).toBe(true)
    }

    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = boxOf(placements.get(items[i].id)!, items[i].label)
        const b = boxOf(placements.get(items[j].id)!, items[j].label)
        expect(overlaps(a, b)).toBe(false)
      }
    }
  })

  it('gives the preferred slot to the higher-priority tag', () => {
    // Same position, so only one of them can hold candidate 0.
    const placements = layoutDatablocks([ac('LOW', 100, 100, 0), ac('HIGH', 100, 100, 5)])

    expect(placements.get('HIGH')!.candidate).toBe(0)
    expect(placements.get('LOW')!.candidate).not.toBe(0)
  })

  it('is deterministic regardless of input order', () => {
    const items = [ac('A', 100, 100), ac('B', 105, 103), ac('C', 98, 108)]
    const forward = layoutDatablocks(items)
    const reversed = layoutDatablocks([...items].reverse())

    for (const item of items) {
      expect(reversed.get(item.id)!.candidate).toBe(forward.get(item.id)!.candidate)
    }
  })

  it('holds last frame\'s slot when it is still clear', () => {
    const items = [ac('A', 100, 100)]
    // A is alone and would naturally take 0; pin it to 3 and it should stay.
    const placements = layoutDatablocks(items, new Map([['A', 3]]))

    expect(placements.get('A')!.candidate).toBe(3)
    expect(placements.get('A')!.clear).toBe(true)
  })

  it('abandons last frame\'s slot once it is taken by higher-priority traffic', () => {
    const items = [ac('LOW', 100, 100, 0), ac('HIGH', 100, 100, 5)]
    // Both remembered in slot 0; HIGH places first and keeps it, LOW must move.
    const placements = layoutDatablocks(items, new Map([['LOW', 0], ['HIGH', 0]]))

    expect(placements.get('HIGH')!.candidate).toBe(0)
    expect(placements.get('LOW')!.candidate).not.toBe(0)
    expect(overlaps(boxOf(placements.get('HIGH')!, PDB), boxOf(placements.get('LOW')!, PDB))).toBe(false)
  })

  it('ignores a remembered candidate that is out of range', () => {
    const placements = layoutDatablocks([ac('A', 100, 100)], new Map([['A', 999]]))
    expect(placements.get('A')!.candidate).toBe(0)
  })

  it('still returns a placement for every tag when the scope is saturated', () => {
    // More tags than candidate slots, all stacked: some must overlap, but no
    // aircraft may be left without a placement.
    const items = Array.from({ length: CANDIDATE_COUNT + 6 }, (_, i) =>
      ac(`AC${String(i).padStart(2, '0')}`, 300, 300),
    )
    const placements = layoutDatablocks(items)

    expect(placements.size).toBe(items.length)
    for (const item of items) expect(placements.has(item.id)).toBe(true)
    // The last few could not be placed cleanly and must say so.
    expect([...placements.values()].some(p => !p.clear)).toBe(true)
  })
})

describe('candidateGeometry', () => {
  it('extends the box away from the blip on every side', () => {
    const w = 40
    const h = 24

    for (let i = 0; i < CANDIDATE_COUNT; i++) {
      const g = candidateGeometry(0, 0, w, h, i)
      // The box must never cover the blip at the origin.
      const coversBlip =
        g.textX < 0 && 0 < g.textX + w && g.textY < 0 && 0 < g.textY + h
      expect(coversBlip).toBe(false)
    }
  })
})

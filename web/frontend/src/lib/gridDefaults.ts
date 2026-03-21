import type { PanelConfig, GridPos } from '../api/types'

const DEFAULT_W = 6
const DEFAULT_H = 2
const COLS = 12

export function assignDefaultGridPos(panels: PanelConfig[]): PanelConfig[] {
  let nextX = 0
  let nextY = 0
  return panels.map(p => {
    if (p.grid_pos) return p
    const w = DEFAULT_W
    const h = DEFAULT_H
    if (nextX + w > COLS) {
      nextX = 0
      nextY += DEFAULT_H
    }
    const grid_pos: GridPos = { x: nextX, y: nextY, w, h }
    nextX += w
    return { ...p, grid_pos }
  })
}

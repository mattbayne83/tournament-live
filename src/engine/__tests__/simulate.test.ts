import { describe, expect, it } from 'vitest'
import { defaultSimConfig, simulate } from '../simulate'

describe('simulate: ladder', () => {
  it('16 teams on 8 courts fills a 2-hour block with everyone playing every round', () => {
    const r = simulate({ ...defaultSimConfig, format: 'ladder', teams: 16, courts: 8, ladderPlayoff: false })
    // 120 / (12+2) = 8 rounds, nobody sits.
    expect(r.segments.filter((s) => s.kind === 'round')).toHaveLength(8)
    expect(r.sitting?.perRound).toBe(0)
    expect(r.gamesPerTeam).toEqual({ min: 8, avg: 8, max: 8 })
    expect(r.totalGames).toBe(64)
    expect(r.totalMinutes).toBeLessThanOrEqual(120)
  })

  it('hybrid playoff removes a court, adds playoff games, and fits the block', () => {
    const r = simulate({ ...defaultSimConfig, format: 'ladder', teams: 16, courts: 8, ladderPlayoff: true })
    expect(r.segments.some((s) => s.kind === 'playoff')).toBe(true)
    expect(r.totalMinutes).toBeLessThanOrEqual(120 + 1)
    // Champion and runner-up get 2 extra games on top of ladder rounds played.
    expect(r.gamesPerTeam.max).toBeGreaterThan(r.gamesPerTeam.min)
    expect(r.notes.join(' ')).toContain('championship court')
  })

  it('35 teams on 8 courts shows the brutal sitting ratio', () => {
    const r = simulate({ ...defaultSimConfig, format: 'ladder', teams: 35, courts: 8, ladderPlayoff: false })
    expect(r.sitting?.perRound).toBe(19)
    expect(r.sitting!.maxConsecutive).toBeGreaterThanOrEqual(1)
    expect(r.gamesPerTeam.avg).toBeLessThan(4.5)
  })
})

describe('simulate: pools', () => {
  it('35 teams / pools of 4 / top 8 lands near the known 2-hour estimate', () => {
    const r = simulate({ ...defaultSimConfig, format: 'pools', teams: 35, courts: 8 })
    // 51 pool games → ≥7 waves; playoff adds 3 bracket rounds.
    const waves = r.segments.filter((s) => s.kind === 'wave')
    expect(waves.length).toBeGreaterThanOrEqual(7)
    expect(r.totalGames).toBe(51 + 7)
    expect(r.gamesPerTeam.min).toBeGreaterThanOrEqual(2)
    expect(r.totalMinutes).toBeGreaterThan(100)
    expect(r.totalMinutes).toBeLessThan(200)
    expect(r.sitting).toBeNull()
  })

  it('every segment tiles the timeline without gaps', () => {
    for (const format of ['ladder', 'pools'] as const) {
      const r = simulate({ ...defaultSimConfig, format, teams: 20, courts: 6 })
      const nonPlayoff = r.segments.filter((s) => s.kind !== 'playoff')
      for (let i = 1; i < nonPlayoff.length; i++) {
        expect(nonPlayoff[i].startMin).toBe(nonPlayoff[i - 1].startMin + nonPlayoff[i - 1].minutes)
      }
    }
  })
})

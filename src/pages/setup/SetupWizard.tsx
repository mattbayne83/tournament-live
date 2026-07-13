import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CalendarClock, Copy, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { Button, Field, Input, Seg, Stepper, Tag, TextArea } from '../../components/ui'
import { useAppStore } from '../../store/store'
import { capacityNotes } from '../../utils/capacity'
import type { Tournament } from '../../types/tournament'

const STEPS = ['Event', 'Divisions', 'Teams', 'Courts', 'Seeding', 'Review'] as const

export default function SetupWizard() {
  const [, navigate] = useLocation()
  const tournament = useAppStore((s) => s.tournament)
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)

  if (!tournament) {
    navigate('/')
    return null
  }
  if (tournament.status !== 'setup') {
    navigate('/admin')
    return null
  }

  const next = () => {
    setError(null)
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }
  const back = () => {
    setError(null)
    setStep((s) => Math.max(s - 1, 0))
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <nav className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {STEPS.map((name, i) => (
          <button
            key={name}
            onClick={() => i < step && setStep(i)}
            className={`font-cond text-sm font-semibold uppercase tracking-widest ${
              i === step ? 'text-flame-deep' : i < step ? 'text-text hover:text-flame-deep' : 'text-text-soft/50'
            }`}
          >
            {i + 1}. {name}
          </button>
        ))}
      </nav>

      <div className="mt-8">
        {step === 0 && <EventStep tournament={tournament} />}
        {step === 1 && <DivisionsStep tournament={tournament} />}
        {step === 2 && <TeamsStep tournament={tournament} />}
        {step === 3 && <CourtsStep tournament={tournament} />}
        {step === 4 && <SeedingStep tournament={tournament} />}
        {step === 5 && <ReviewStep tournament={tournament} onError={setError} />}
      </div>

      {error && <p className="mt-6 border-2 border-flame-deep bg-flame-tint px-4 py-3 font-semibold text-flame-deep">{error}</p>}

      <div className="mt-10 flex items-center justify-between">
        <Button variant="ghost" onClick={step === 0 ? () => navigate('/') : back}>
          <ArrowLeft size={18} /> {step === 0 ? 'Home' : 'Back'}
        </Button>
        {step < STEPS.length - 1 && (
          <Button onClick={next}>
            Next <ArrowRight size={18} />
          </Button>
        )}
      </div>
    </div>
  )
}

function StepTitle({ title, blurb }: { title: string; blurb: string }) {
  return (
    <header>
      <h2 className="font-display text-4xl uppercase text-text">{title}</h2>
      <p className="mt-2 max-w-xl text-text-soft">{blurb}</p>
    </header>
  )
}

// --- Step 1: Event ---

function EventStep({ tournament }: { tournament: Tournament }) {
  const commit = useAppStore((s) => s.commit)
  const [name, setName] = useState(tournament.name)
  return (
    <div className="space-y-8">
      <StepTitle title="The event" blurb="Name it and say how many physical courts you have." />
      <Field label="Tournament name">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && commit('Rename', (t) => void (t.name = name.trim()))}
          placeholder="United Way ONEOK Pickleball"
        />
      </Field>
      <Field label="Courts available" hint="Total physical courts at the venue.">
        <Stepper
          value={tournament.courtsTotal}
          min={1}
          max={16}
          onChange={(n) => commit('Set courts', (t) => void (t.courtsTotal = n))}
        />
      </Field>
    </div>
  )
}

// --- Step 2: Divisions ---

function DivisionsStep({ tournament }: { tournament: Tournament }) {
  const { addDivision, removeDivision, commit, updateLadderConfig, updatePoolConfig } = useAppStore()
  return (
    <div className="space-y-8">
      <StepTitle
        title="Divisions"
        blurb="Each division has its own teams, format, and courts — e.g. Competitive on a ladder, Recreational in pools."
      />
      <div className="space-y-6">
        {tournament.divisions.map((div) => (
          <section key={div.id} className="border-2 border-line bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <Field label="Division name">
                <Input
                  defaultValue={div.name}
                  onBlur={(e) => {
                    const v = e.target.value.trim()
                    if (v && v !== div.name)
                      commit('Rename division', (t) => {
                        t.divisions.find((d) => d.id === div.id)!.name = v
                      })
                  }}
                />
              </Field>
              <button
                onClick={() => removeDivision(div.id)}
                aria-label={`remove ${div.name}`}
                className="mt-7 p-2 text-text-soft hover:text-flame-deep"
              >
                <Trash2 size={18} />
              </button>
            </div>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <Field label="Format">
                <Seg
                  options={[
                    { value: 'ladder', label: 'Up/down ladder' },
                    { value: 'pools', label: 'Pools → playoff' },
                  ]}
                  value={div.format.kind === 'ladder' ? 'ladder' : 'pools'}
                  onChange={(kind) => {
                    if (kind === div.format.kind) return
                    // Swapping format in setup: recreate the division state wholesale.
                    commit('Change format', (t) => {
                      const d = t.divisions.find((x) => x.id === div.id)!
                      const teamIds = Object.values(t.teams)
                        .filter((team) => team.divisionId === div.id)
                        .map((team) => team.id)
                      d.format =
                        kind === 'ladder'
                          ? {
                              kind: 'ladder',
                              config: { roundMinutes: 12, tieRule: 'suddenDeathPoint', exemptTopCourtFromByes: true, playoffTopN: 4 },
                              state: {
                                order: teamIds,
                                roundIndex: 0,
                                roundPhase: 'idle',
                                currentMatchIds: [],
                                currentSitters: [],
                                byeCounts: Object.fromEntries(teamIds.map((id) => [id, 0])),
                                lastByeRound: Object.fromEntries(teamIds.map((id) => [id, -1])),
                                stats: Object.fromEntries(teamIds.map((id) => [id, { w: 0, l: 0, pf: 0, pa: 0 }])),
                                timer: { startedAt: null, durationSec: 720, pausedRemainingSec: null },
                                history: [],
                                playoff: null,
                              },
                            }
                          : {
                              kind: 'pools',
                              config: { poolSize: 4, playoffTeamCount: 8, rngSeed: `draw-${div.id}` },
                              state: { pools: [], phase: 'pool', playoff: null },
                            }
                    })
                  }}
                />
              </Field>

              {div.format.kind === 'ladder' ? (
                <Field label="Round length" hint="Timed rounds — winners move up a court, losers down.">
                  <Stepper
                    value={div.format.config.roundMinutes}
                    min={6}
                    max={20}
                    format={(n) => `${n}m`}
                    onChange={(n) => updateLadderConfig(div.id, { roundMinutes: n })}
                  />
                </Field>
              ) : div.format.kind === 'pools' ? (
                <div className="flex flex-wrap gap-5">
                  <Field label="Pool size">
                    <Seg
                      options={[
                        { value: '3', label: '3' },
                        { value: '4', label: '4' },
                        { value: '5', label: '5' },
                      ]}
                      value={String(div.format.config.poolSize) as '3' | '4' | '5'}
                      onChange={(v) => updatePoolConfig(div.id, { poolSize: Number(v) as 3 | 4 | 5 })}
                    />
                  </Field>
                  <Field label="Playoff teams">
                    <Stepper
                      value={div.format.config.playoffTeamCount}
                      min={2}
                      max={16}
                      onChange={(n) => updatePoolConfig(div.id, { playoffTeamCount: n })}
                    />
                  </Field>
                </div>
              ) : null}
            </div>
          </section>
        ))}
      </div>
      <Button variant="secondary" onClick={() => addDivision(`Division ${tournament.divisions.length + 1}`, 'ladder')}>
        <Plus size={18} /> Add division
      </Button>
    </div>
  )
}

// --- Step 3: Teams ---

function parseTeams(text: string): Array<{ name: string; players: [string, string] }> {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\t|,/).map((p) => p.trim()).filter(Boolean)
      if (parts.length >= 3) return { name: parts[0], players: [parts[1], parts[2]] as [string, string] }
      if (parts.length === 2) return { name: `${parts[0]} & ${parts[1]}`, players: [parts[0], parts[1]] as [string, string] }
      const duo = line.split(/ & | \/ /).map((p) => p.trim()).filter(Boolean)
      if (duo.length === 2) return { name: line, players: [duo[0], duo[1]] as [string, string] }
      return { name: line, players: ['', ''] as [string, string] }
    })
}

function serializeTeams(t: Tournament, divisionId: string): string {
  return Object.values(t.teams)
    .filter((team) => team.divisionId === divisionId)
    .map((team) =>
      team.players[0] ? `${team.name}, ${team.players[0]}, ${team.players[1]}` : team.name,
    )
    .join('\n')
}

/** Testing helper: pun-grade sample teams so a full dry run is two clicks. */
const SAMPLE_TEAMS = [
  'Dink Dynasty', 'Net Gains', 'The Kitchen Rulers', 'Big Dill Energy', 'Drop Shot Divas', 'Dill With It',
  'Rally Cats', 'Court Jesters', 'The Volley Llamas', 'Zero Zero Two', 'Paddle Battle', 'Lob City',
  'Sweet Dinks', 'Holy Volley', 'Slice Slice Baby', 'No Dinking Way', "Dinkin' Donuts", 'The Baseliners',
  'Kitchen Nightmares', 'Serve-ivors', 'Smash Bros', 'Pickle Rick’s', 'Chicken N Pickle', 'The Ernes',
]
const SAMPLE_PLAYERS = ['Alex', 'Sam', 'Jordan', 'Priya', 'Casey', 'Morgan', 'Riley', 'Devon', 'Jamie', 'Quinn', 'Taylor', 'Drew']

function sampleTeamLines(count: number, offset = 0): string {
  return Array.from({ length: count }, (_, i) => {
    const name = SAMPLE_TEAMS[(i + offset) % SAMPLE_TEAMS.length] + (i + offset >= SAMPLE_TEAMS.length ? ` ${Math.floor((i + offset) / SAMPLE_TEAMS.length) + 1}` : '')
    const p1 = SAMPLE_PLAYERS[(i * 2 + offset) % SAMPLE_PLAYERS.length]
    const p2 = SAMPLE_PLAYERS[(i * 2 + 1 + offset) % SAMPLE_PLAYERS.length]
    return `${name}, ${p1} ${String.fromCharCode(65 + (i % 26))}., ${p2} ${String.fromCharCode(66 + (i % 25))}.`
  }).join('\n')
}

function TeamsStep({ tournament }: { tournament: Tournament }) {
  const setTeams = useAppStore((s) => s.setTeams)
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(tournament.divisions.map((d) => [d.id, serializeTeams(tournament, d.id)])),
  )

  return (
    <div className="space-y-8">
      <StepTitle
        title="Teams"
        blurb="Paste one team per line: “Team name, Player 1, Player 2”. A line with just two names becomes a team automatically."
      />
      {tournament.divisions.map((div, divIndex) => {
        const parsed = parseTeams(drafts[div.id] ?? '')
        const fillSamples = (count: number) => {
          const text = sampleTeamLines(count, divIndex * 12)
          setDrafts((d) => ({ ...d, [div.id]: text }))
          setTeams(div.id, parseTeams(text))
        }
        return (
          <section key={div.id} className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display text-2xl uppercase">{div.name}</h3>
              <div className="flex items-baseline gap-3">
                <span className="font-cond text-xs font-semibold uppercase tracking-wider text-text-soft/70">testing:</span>
                {[8, 16, 24].map((n) => (
                  <button
                    key={n}
                    onClick={() => fillSamples(n)}
                    className="font-cond text-sm font-bold uppercase tracking-wider text-uw hover:text-flame-deep"
                  >
                    fill {n}
                  </button>
                ))}
                <span className="tabular font-cond font-semibold uppercase tracking-wider text-text-soft">
                  {parsed.length} team{parsed.length === 1 ? '' : 's'}
                </span>
              </div>
            </div>
            <TextArea
              value={drafts[div.id] ?? ''}
              onChange={(e) => setDrafts((d) => ({ ...d, [div.id]: e.target.value }))}
              onBlur={() => setTeams(div.id, parseTeams(drafts[div.id] ?? ''))}
              placeholder={'Dink Dynasty, Sam Hill, Priya Patel\nNet Gains, Alex Kim, Jordan Lee'}
              spellCheck={false}
            />
          </section>
        )
      })}
    </div>
  )
}

// --- Step 4: Courts ---

function CourtsStep({ tournament }: { tournament: Tournament }) {
  const updateDivisionCourts = useAppStore((s) => s.updateDivisionCourts)
  const allCourts = Array.from({ length: tournament.courtsTotal }, (_, i) => i + 1)
  const teamCount = (divId: string) =>
    Object.values(tournament.teams).filter((t) => t.divisionId === divId && t.status === 'active').length

  return (
    <div className="space-y-8">
      <StepTitle
        title="Courts"
        blurb="Give each division its courts. Divisions can share the venue in time blocks (both take all courts, one after the other) or split it and run simultaneously — you can change this live between rounds."
      />
      {tournament.divisions.map((div, i) => (
        <section key={div.id} className="space-y-3 border-2 border-line bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-display text-2xl uppercase">{div.name}</h3>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => updateDivisionCourts(div.id, allCourts)}>
                All courts
              </Button>
              {tournament.divisions.length > 1 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const half = Math.ceil(allCourts.length / tournament.divisions.length)
                    updateDivisionCourts(div.id, allCourts.slice(i * half, (i + 1) * half))
                  }}
                >
                  Split evenly
                </Button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {allCourts.map((c) => {
              const on = div.courtIds.includes(c)
              return (
                <button
                  key={c}
                  onClick={() =>
                    updateDivisionCourts(div.id, on ? div.courtIds.filter((x) => x !== c) : [...div.courtIds, c])
                  }
                  className={`tabular h-12 w-12 border-2 font-display text-lg transition-colors ${
                    on ? 'border-ink bg-ink text-board-text' : 'border-line bg-white text-text-soft hover:border-ink-3'
                  }`}
                >
                  {c}
                </button>
              )
            })}
          </div>
          <ul className="space-y-0.5 pt-1">
            {capacityNotes(div, teamCount(div.id)).map((note) => (
              <li key={note} className="font-cond font-semibold uppercase tracking-wider text-uw">
                {note}
              </li>
            ))}
          </ul>
          <Link
            href={simulateHref(div, teamCount(div.id))}
            className="inline-flex items-center gap-1.5 font-cond text-sm font-bold uppercase tracking-wider text-flame-deep hover:text-ink"
          >
            <CalendarClock size={15} /> Simulate this division in the day planner
          </Link>
        </section>
      ))}
    </div>
  )
}

function simulateHref(div: Tournament['divisions'][number], teams: number): string {
  const q = new URLSearchParams({ teams: String(Math.max(4, teams)), courts: String(Math.max(1, div.courtIds.length)) })
  if (div.format.kind === 'ladder') {
    q.set('format', 'ladder')
    q.set('round', String(div.format.config.roundMinutes))
    q.set('playoff', div.format.config.playoffTopN > 0 ? '1' : '0')
  } else if (div.format.kind === 'pools') {
    q.set('format', 'pools')
    q.set('pool', String(div.format.config.poolSize))
    q.set('playoffTeams', String(div.format.config.playoffTeamCount))
  }
  return `/plan?${q.toString()}`
}

// --- Step 5: Seeding ---

function SeedingStep({ tournament }: { tournament: Tournament }) {
  const setLadderSeedOrder = useAppStore((s) => s.setLadderSeedOrder)
  const ladders = tournament.divisions.filter((d) => d.format.kind === 'ladder')
  if (ladders.length === 0) {
    return (
      <StepTitle title="Seeding" blurb="No ladder divisions — pool draws are randomized automatically. Continue to review." />
    )
  }
  return (
    <div className="space-y-8">
      <StepTitle
        title="Seeding"
        blurb="Starting ladder order, top court first. Don't overthink it — the ladder self-sorts within a few rounds."
      />
      {ladders.map((div) => {
        if (div.format.kind !== 'ladder') return null
        const order = div.format.state.order
        const move = (from: number, dir: -1 | 1) => {
          const to = from + dir
          if (to < 0 || to >= order.length) return
          const next = [...order]
          ;[next[from], next[to]] = [next[to], next[from]]
          setLadderSeedOrder(div.id, next)
        }
        return (
          <section key={div.id} className="space-y-3">
            <h3 className="font-display text-2xl uppercase">{div.name}</h3>
            <ol className="divide-y-2 divide-paper-2 border-2 border-line bg-white">
              {order.map((teamId, i) => (
                <li key={teamId} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="tabular w-8 font-display text-lg text-text-soft">{i + 1}</span>
                  <span className="flex-1 font-semibold">{tournament.teams[teamId]?.name}</span>
                  <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="move up" className="p-2 text-text-soft hover:text-flame-deep disabled:opacity-20">
                    <ArrowUp size={16} />
                  </button>
                  <button onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label="move down" className="p-2 text-text-soft hover:text-flame-deep disabled:opacity-20">
                    <ArrowDown size={16} />
                  </button>
                </li>
              ))}
            </ol>
          </section>
        )
      })}
    </div>
  )
}

// --- Step 6: Review & go live ---

function ReviewStep({ tournament, onError }: { tournament: Tournament; onError: (e: string | null) => void }) {
  const [, navigate] = useLocation()
  const goLive = useAppStore((s) => s.goLive)
  const adminKey = useAppStore((s) => s.adminKey)
  const teamCount = useMemo(
    () => (divId: string) => Object.values(tournament.teams).filter((t) => t.divisionId === divId).length,
    [tournament],
  )

  return (
    <div className="space-y-8">
      <StepTitle title="Review" blurb="One look before the whistle." />
      <div className="grid gap-4 sm:grid-cols-2">
        {tournament.divisions.map((div) => (
          <section key={div.id} className="border-2 border-line bg-white p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl uppercase">{div.name}</h3>
              <Tag>{div.format.kind === 'ladder' ? 'Ladder' : 'Pools'}</Tag>
            </div>
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-text-soft">Teams</dt><dd className="tabular font-semibold">{teamCount(div.id)}</dd></div>
              <div className="flex justify-between"><dt className="text-text-soft">Courts</dt><dd className="tabular font-semibold">{div.courtIds.join(', ') || '—'}</dd></div>
              {div.format.kind === 'ladder' && (
                <div className="flex justify-between"><dt className="text-text-soft">Round length</dt><dd className="tabular font-semibold">{div.format.config.roundMinutes} min</dd></div>
              )}
              {div.format.kind === 'pools' && (
                <div className="flex justify-between"><dt className="text-text-soft">Playoff</dt><dd className="tabular font-semibold">top {div.format.config.playoffTeamCount}</dd></div>
              )}
            </dl>
          </section>
        ))}
      </div>

      {adminKey && (
        <div className="border-2 border-ink bg-ink p-5 text-board-text">
          <p className="font-cond font-semibold uppercase tracking-widest text-board-soft">Admin key — write this down</p>
          <div className="mt-2 flex items-center gap-3">
            <code className="tabular text-lg tracking-wider">{adminKey}</code>
            <button
              onClick={() => void navigator.clipboard.writeText(adminKey)}
              aria-label="copy admin key"
              className="p-2 text-board-soft hover:text-flame"
            >
              <Copy size={16} />
            </button>
          </div>
          <p className="mt-2 text-sm text-board-soft">
            It's saved on this device, but it's your only way back in if this device dies mid-event.
          </p>
        </div>
      )}

      <Button
        size="lg"
        onClick={() => {
          try {
            goLive()
            navigate('/admin')
          } catch (err) {
            onError(err instanceof Error ? err.message : 'Something isn’t ready yet')
          }
        }}
      >
        Go live
      </Button>
    </div>
  )
}

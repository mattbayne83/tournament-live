import { ArrowLeft } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'wouter'
import { Field, Seg, Stepper } from '../../components/ui'
import { defaultSimConfig, simulate, type SimConfig, type SimSegment } from '../../engine/simulate'

function fromQuery(search: string): SimConfig {
  const q = new URLSearchParams(search)
  const num = (key: string, fallback: number) => {
    const v = Number(q.get(key))
    return Number.isFinite(v) && v > 0 ? v : fallback
  }
  const d = defaultSimConfig
  return {
    format: q.get('format') === 'pools' ? 'pools' : q.get('format') === 'ladder' ? 'ladder' : d.format,
    teams: num('teams', d.teams),
    courts: num('courts', d.courts),
    blockMinutes: num('block', d.blockMinutes),
    avgGameMinutes: num('game', d.avgGameMinutes),
    roundMinutes: num('round', d.roundMinutes),
    transitionMinutes: d.transitionMinutes,
    ladderPlayoff: q.get('playoff') !== '0',
    poolSize: ([3, 4, 5].includes(num('pool', d.poolSize)) ? num('pool', d.poolSize) : d.poolSize) as 3 | 4 | 5,
    playoffTeamCount: num('playoffTeams', d.playoffTeamCount),
  }
}

const fmtDuration = (min: number) => {
  const m = Math.round(min)
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`
}

/** What-if day planner: tune a format and watch the timeline + fairness react. */
export default function Planner() {
  const [cfg, setCfg] = useState<SimConfig>(() => fromQuery(location.search))
  const result = useMemo(() => simulate(cfg), [cfg])
  const set = (changes: Partial<SimConfig>) => setCfg((c) => ({ ...c, ...changes }))
  const overBy = result.totalMinutes - cfg.blockMinutes

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="flex items-baseline gap-4">
        <Link href="/" className="p-1 text-text-soft hover:text-text" aria-label="home">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="font-display text-4xl uppercase">Day planner</h1>
          <p className="mt-1 max-w-2xl text-text-soft">
            Simulate a division before you commit to a format. Runs the real pairing engines with random results, so
            bye rotation and playoff structure behave exactly like game day.
          </p>
        </div>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,20rem)_1fr]">
        <aside className="space-y-5">
          <Field label="Format">
            <Seg
              options={[
                { value: 'ladder', label: 'Ladder' },
                { value: 'pools', label: 'Pools → playoff' },
              ]}
              value={cfg.format}
              onChange={(format) => set({ format })}
            />
          </Field>
          <div className="flex flex-wrap gap-5">
            <Field label="Teams">
              <Stepper value={cfg.teams} min={4} max={80} onChange={(teams) => set({ teams })} />
            </Field>
            <Field label="Courts">
              <Stepper value={cfg.courts} min={1} max={16} onChange={(courts) => set({ courts })} />
            </Field>
          </div>
          <Field label="Time block" hint="What the schedule gives this division.">
            <Stepper value={cfg.blockMinutes} min={30} max={360} step={15} format={fmtDuration} onChange={(blockMinutes) => set({ blockMinutes })} />
          </Field>

          {cfg.format === 'ladder' ? (
            <>
              <div className="flex flex-wrap gap-5">
                <Field label="Round length">
                  <Stepper value={cfg.roundMinutes} min={6} max={20} format={(n) => `${n}m`} onChange={(roundMinutes) => set({ roundMinutes })} />
                </Field>
                <Field label="Transition">
                  <Stepper value={cfg.transitionMinutes} min={0} max={6} format={(n) => `${n}m`} onChange={(transitionMinutes) => set({ transitionMinutes })} />
                </Field>
              </div>
              <Field label="Championship finish" hint="Top 4 pulled onto one court for semis + final near block end.">
                <Seg
                  options={[
                    { value: 'yes', label: 'Top-4 playoff' },
                    { value: 'no', label: 'Ladder only' },
                  ]}
                  value={cfg.ladderPlayoff ? 'yes' : 'no'}
                  onChange={(v) => set({ ladderPlayoff: v === 'yes' })}
                />
              </Field>
            </>
          ) : (
            <>
              <div className="flex flex-wrap gap-5">
                <Field label="Pool size">
                  <Seg
                    options={[
                      { value: '3', label: '3' },
                      { value: '4', label: '4' },
                      { value: '5', label: '5' },
                    ]}
                    value={String(cfg.poolSize) as '3' | '4' | '5'}
                    onChange={(v) => set({ poolSize: Number(v) as 3 | 4 | 5 })}
                  />
                </Field>
                <Field label="Playoff teams">
                  <Stepper value={cfg.playoffTeamCount} min={2} max={16} onChange={(playoffTeamCount) => set({ playoffTeamCount })} />
                </Field>
              </div>
              <Field label="Game length" hint="Average game incl. switchover.">
                <Stepper value={cfg.avgGameMinutes} min={8} max={20} format={(n) => `${n}m`} onChange={(avgGameMinutes) => set({ avgGameMinutes })} />
              </Field>
            </>
          )}
        </aside>

        <main className="min-w-0 space-y-6">
          <div className="border-2 border-ink bg-ink px-6 py-4 text-board-text">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <span className="tabular font-display text-5xl">{fmtDuration(result.totalMinutes)}</span>
              <span className={`font-cond text-lg font-bold uppercase tracking-wider ${overBy > 0 ? 'text-flame' : 'text-court'}`}>
                {overBy > 0 ? `${Math.round(overBy)} min over the block` : `fits — ${Math.round(-overBy)} min to spare`}
              </span>
            </div>
          </div>

          <Timeline segments={result.segments} blockMinutes={cfg.blockMinutes} totalMinutes={result.totalMinutes} />

          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 border-2 border-line bg-white p-5 sm:grid-cols-4">
            <Stat label="Games per team" value={`${result.gamesPerTeam.min}–${result.gamesPerTeam.max}`} sub={`avg ${result.gamesPerTeam.avg}`} />
            <Stat label="Total games" value={String(result.totalGames)} />
            {result.sitting && (
              <>
                <Stat label="Sitting per round" value={String(result.sitting.perRound)} sub={`of ${cfg.teams} teams`} />
                <Stat label="Longest sit streak" value={`${result.sitting.maxConsecutive} round${result.sitting.maxConsecutive === 1 ? '' : 's'}`} />
              </>
            )}
          </dl>

          {result.notes.length > 0 && (
            <ul className="space-y-1">
              {result.notes.map((note) => (
                <li key={note} className="font-cond font-semibold uppercase tracking-wider text-uw">
                  {note}
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="font-cond text-xs font-bold uppercase tracking-widest text-text-soft">{label}</dt>
      <dd className="tabular mt-0.5 font-display text-2xl">
        {value}
        {sub && <span className="ml-2 font-sans text-sm font-normal text-text-soft">{sub}</span>}
      </dd>
    </div>
  )
}

const segColor: Record<SimSegment['kind'], string> = {
  round: 'bg-uw',
  wave: 'bg-uw',
  playoff: 'bg-flame',
}

function Timeline({ segments, blockMinutes, totalMinutes }: { segments: SimSegment[]; blockMinutes: number; totalMinutes: number }) {
  const span = Math.max(blockMinutes, totalMinutes) * 1.02
  const pct = (min: number) => `${(min / span) * 100}%`
  const main = segments.filter((s) => s.kind !== 'playoff')
  const playoff = segments.filter((s) => s.kind === 'playoff')
  const hourTicks = Array.from({ length: Math.floor(span / 30) }, (_, i) => (i + 1) * 30)

  return (
    <div className="border-2 border-line bg-white p-5">
      <div className="relative">
        {/* main lane */}
        <div className="relative h-12">
          {main.map((s, i) => (
            <div
              key={s.label}
              title={`${s.label} · ${Math.round(s.minutes)}m`}
              className={`absolute inset-y-0 flex items-center justify-center overflow-hidden border-r border-white ${segColor[s.kind]} ${i % 2 ? 'opacity-80' : ''}`}
              style={{ left: pct(s.startMin), width: pct(s.minutes) }}
            >
              <span className="truncate px-1 font-cond text-[11px] font-bold uppercase text-paper">
                {s.label.replace('Round ', 'R').replace('Wave ', 'W')}
              </span>
            </div>
          ))}
        </div>
        {/* playoff lane */}
        {playoff.length > 0 && (
          <div className="relative mt-1 h-8">
            {playoff.map((s) => (
              <div
                key={s.label + s.startMin}
                title={`${s.label} · ${Math.round(s.minutes)}m`}
                className="absolute inset-y-0 flex items-center justify-center overflow-hidden bg-flame"
                style={{ left: pct(s.startMin), width: pct(s.minutes) }}
              >
                <span className="truncate px-1 font-cond text-[11px] font-bold uppercase text-ink">{s.label}</span>
              </div>
            ))}
          </div>
        )}
        {/* block target marker */}
        <div className="absolute -inset-y-1 w-0.5 bg-flame-deep" style={{ left: pct(blockMinutes) }} />
        {/* ticks */}
        <div className="relative mt-1 h-4">
          {hourTicks.map((t) => (
            <span key={t} className="tabular absolute -translate-x-1/2 font-cond text-[10px] text-text-soft" style={{ left: pct(t) }}>
              {t % 60 === 0 ? `${t / 60}h` : ''}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-1 font-cond text-xs uppercase tracking-wider text-text-soft">
        <span className="mr-3 inline-block h-2.5 w-2.5 bg-uw align-middle" /> rounds / waves
        <span className="mx-3 inline-block h-2.5 w-2.5 bg-flame align-middle" /> playoff
        <span className="mx-3 inline-block h-3 w-0.5 bg-flame-deep align-middle" /> block ends
      </p>
    </div>
  )
}

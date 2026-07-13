import type { StandingRow, Team, TeamId } from '../types/tournament'

export function StandingsTable({
  rows,
  teams,
  title,
}: {
  rows: StandingRow[]
  teams: Record<TeamId, Team>
  title?: string
}) {
  return (
    <div>
      {title && <h4 className="mb-2 font-display text-lg uppercase text-text-soft">{title}</h4>}
      <table className="w-full border-2 border-line bg-white text-sm">
        <thead>
          <tr className="bg-paper-2 font-cond uppercase tracking-wider text-text-soft">
            <th className="w-10 px-2 py-1.5 text-right">#</th>
            <th className="px-3 py-1.5 text-left">Team</th>
            <th className="w-14 px-2 py-1.5 text-right">W–L</th>
            <th className="w-14 px-2 py-1.5 text-right">+/−</th>
          </tr>
        </thead>
        <tbody className="tabular">
          {rows.map((row) => {
            const team = teams[row.teamId]
            const withdrawn = team?.status === 'withdrawn'
            return (
              <tr key={row.teamId} className={`border-t border-paper-2 ${row.rank === 1 ? 'bg-flame-tint' : ''}`}>
                <td className="px-2 py-1.5 text-right font-display text-base text-text-soft">{row.rank}</td>
                <td className={`px-3 py-1.5 font-semibold ${withdrawn ? 'text-text-soft line-through' : ''}`}>
                  {team?.name ?? row.teamId}
                  {row.note && <span className="ml-2 font-cond text-xs font-semibold uppercase text-uw-soft">{row.note}</span>}
                </td>
                <td className="px-2 py-1.5 text-right">
                  {row.w}–{row.l}
                </td>
                <td className={`px-2 py-1.5 text-right ${row.diff > 0 ? 'text-court' : row.diff < 0 ? 'text-flame-deep' : 'text-text-soft'}`}>
                  {row.diff > 0 ? `+${row.diff}` : row.diff}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

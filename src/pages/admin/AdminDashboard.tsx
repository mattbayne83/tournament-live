import { useLocation } from 'wouter'
import { Tag } from '../../components/ui'
import { useAppStore } from '../../store/store'

/** Placeholder shell — Phase 5 replaces this with the full courtside dashboard. */
export default function AdminDashboard() {
  const [, navigate] = useLocation()
  const tournament = useAppStore((s) => s.tournament)

  if (!tournament) {
    navigate('/')
    return null
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-4xl uppercase">{tournament.name}</h1>
        <Tag tone="flame">{tournament.status}</Tag>
      </div>
      <p className="mt-4 text-text-soft">
        Organizer dashboard lands in the next phase — score entry, round timer, and court grid.
      </p>
      <ul className="mt-6 space-y-2">
        {tournament.divisions.map((d) => (
          <li key={d.id} className="border-2 border-line bg-white px-4 py-3 font-semibold">
            {d.name} · {d.format.kind} · courts {d.courtIds.join(', ') || '—'}
          </li>
        ))}
      </ul>
    </div>
  )
}

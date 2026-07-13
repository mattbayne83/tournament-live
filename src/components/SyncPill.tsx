import { Check, CloudOff, Link2, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { publisherRef } from '../store/publisher'
import { useAppStore } from '../store/store'

/** Live-publish status + share link, always visible in the admin header. */
export function SyncPill() {
  const sync = useAppStore((s) => s.sync)
  const tournament = useAppStore((s) => s.tournament)
  const [copied, setCopied] = useState(false)

  if (!tournament) return null
  const liveUrl = `${location.origin}/t/${tournament.id}`

  const state =
    sync.status === 'offline' || sync.status === 'error'
      ? {
          className: 'border-flame-deep text-flame-deep',
          icon: <CloudOff size={14} />,
          text: sync.status === 'offline' ? 'Offline — will sync' : 'Sync error — tap to retry',
        }
      : sync.dirty || sync.status === 'publishing'
        ? { className: 'border-line text-text-soft', icon: <RefreshCw size={14} className="animate-spin" />, text: 'Publishing…' }
        : sync.publishCount > 0
          ? { className: 'border-line text-text-soft', icon: <Check size={14} />, text: `Live · rev ${sync.lastPublishedRev}` }
          : { className: 'border-line text-text-soft', icon: <CloudOff size={14} />, text: 'Not published yet' }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => publisherRef.current?.kick()}
        title={`${sync.publishCount} publishes this session${sync.lastError ? ` · ${sync.lastError}` : ''}`}
        className={`flex items-center gap-1.5 border-2 px-2.5 py-1 font-cond text-xs font-bold uppercase tracking-wider ${state.className}`}
      >
        {state.icon} {state.text}
      </button>
      <button
        onClick={() => {
          void navigator.clipboard.writeText(liveUrl)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
        title={liveUrl}
        className="flex items-center gap-1.5 border-2 border-line px-2.5 py-1 font-cond text-xs font-bold uppercase tracking-wider text-text-soft hover:border-flame hover:text-flame-deep"
      >
        <Link2 size={14} /> {copied ? 'Copied!' : 'Share link'}
      </button>
    </div>
  )
}

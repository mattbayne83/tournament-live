import { Minus, Plus } from 'lucide-react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { useEffect } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-flame text-ink font-bold hover:bg-flame-deep hover:text-paper active:translate-y-px',
  secondary: 'border-2 border-ink-3 text-text font-semibold hover:border-flame hover:text-flame-deep',
  ghost: 'text-text-soft font-semibold hover:text-text hover:bg-paper-2',
  danger: 'bg-flame-deep text-paper font-bold hover:bg-ink',
}

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-5 text-base',
  lg: 'h-14 px-7 text-lg',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${buttonVariants[variant]} ${buttonSizes[size]} ${className}`}
      {...props}
    />
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="font-cond text-sm font-semibold uppercase tracking-widest text-text-soft">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1.5 text-sm text-text-soft">{hint}</p>}
    </label>
  )
}

const inputClass =
  'w-full border-2 border-line bg-white px-3 py-2.5 text-base text-text outline-none transition-colors placeholder:text-text-soft/60 focus:border-flame'

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={inputClass} {...props} />
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${inputClass} min-h-40 font-mono text-sm leading-relaxed`} {...props} />
}

/** Big-thumbed numeric stepper — courtside numbers are never typed. */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
  step = 1,
  format = (n: number) => String(n),
}: {
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  step?: number
  format?: (n: number) => string
}) {
  return (
    <div className="inline-flex items-stretch border-2 border-line bg-white">
      <button
        type="button"
        aria-label="decrease"
        className="grid w-11 place-items-center text-text-soft hover:bg-paper-2 hover:text-flame-deep disabled:opacity-30"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - step))}
      >
        <Minus size={18} strokeWidth={3} />
      </button>
      <span className="tabular grid min-w-14 place-items-center border-x-2 border-line px-2 font-display text-xl">
        {format(value)}
      </span>
      <button
        type="button"
        aria-label="increase"
        className="grid w-11 place-items-center text-text-soft hover:bg-paper-2 hover:text-flame-deep disabled:opacity-30"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + step))}
      >
        <Plus size={18} strokeWidth={3} />
      </button>
    </div>
  )
}

export function Seg<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex border-2 border-line bg-white">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-4 py-2 font-cond text-sm font-semibold uppercase tracking-wider transition-colors ${
            value === opt.value ? 'bg-ink text-board-text' : 'text-text-soft hover:text-text'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function Tag({ children, tone = 'uw' }: { children: ReactNode; tone?: 'uw' | 'flame' | 'gold' }) {
  const tones = {
    uw: 'bg-uw text-paper',
    flame: 'bg-flame text-ink',
    gold: 'bg-gold text-ink',
  }
  return (
    <span className={`inline-block px-2 py-0.5 font-cond text-xs font-bold uppercase tracking-widest ${tones[tone]}`}>
      {children}
    </span>
  )
}

/** Blocking confirmation — prefer this over window.confirm for destructive actions. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  body: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-4"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="w-full max-w-md border-2 border-ink bg-paper p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" className="font-display text-2xl uppercase text-text">
          {title}
        </h2>
        <div className="mt-3 text-sm leading-relaxed text-text-soft">{body}</div>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={danger ? 'danger' : 'primary'} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

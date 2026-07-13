import qrcode from 'qrcode-generator'
import { useMemo } from 'react'

/** Crisp SVG QR with quiet zone; color inherits from `fg`/`bg` props. */
export function QrCode({ value, size = 96, fg = '#0b0e17', bg = '#ffffff' }: { value: string; size?: number; fg?: string; bg?: string }) {
  const cells = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(value)
    qr.make()
    const n = qr.getModuleCount()
    const rects: Array<[number, number]> = []
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) rects.push([c, r])
      }
    }
    return { n, rects }
  }, [value])

  const quiet = 2
  const total = cells.n + quiet * 2
  return (
    <svg width={size} height={size} viewBox={`0 0 ${total} ${total}`} role="img" aria-label={`QR code for ${value}`}>
      <rect width={total} height={total} fill={bg} />
      {cells.rects.map(([c, r]) => (
        <rect key={`${c}-${r}`} x={c + quiet} y={r + quiet} width={1} height={1} fill={fg} />
      ))}
    </svg>
  )
}

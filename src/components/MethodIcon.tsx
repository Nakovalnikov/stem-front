import type { Method } from '../domain/types'

// Ті самі нерівномірні навчальні точки для кожного способу корекції.
const points: [number, number][] = [
  [6, 41], [17, 27], [28, 35], [40, 20], [54, 10],
]

const paths: Record<Method, string> = {
  linear: 'M6 41 L54 10',
  piecewise: 'M6 41 L17 27 L28 35 L40 20 L54 10',
  rbf: 'M6 41 C14 40 17 34 23 32 S32 29 37 22 S47 11 54 10',
  smooth: 'M6 39 C13 34 19 31 27 31 S39 23 54 13',
  exponential: 'M6 39 C23 39 39 32 54 8',
  auto: 'M6 41 C14 40 17 34 23 32 S32 29 37 22 S47 11 54 10',
}

export function MethodIcon({ method }: { method: Method }) {
  return (
    <svg viewBox="0 0 60 50" className="method-icon" aria-hidden="true">
      <path d="M4 47H57M4 47V4" stroke="var(--graph-axis)" strokeWidth="1" fill="none" />
      {method === 'auto' && (['linear', 'piecewise', 'rbf', 'smooth', 'exponential'] as const).map(key => (
        <path
          key={key}
          d={paths[key]}
          stroke="var(--graph-alternative)"
          strokeWidth="1.3"
          opacity="0.65"
          fill="none"
        />
      ))}
      <path d={paths[method]} stroke="var(--graph-model)" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {points.map(([x, y], index) => (
        <circle key={index} cx={x} cy={y} r="2.1" fill="var(--graph-reference)" />
      ))}
    </svg>
  )
}

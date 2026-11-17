import type { DataRow, RunRequest, TrainingRow, Method } from './types'

export function numeric(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value.trim().replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

export function readable(value: number | null | undefined, digits = 2): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? 'Н/Д' : Number(value.toFixed(digits)).toLocaleString('uk-UA')
}

export function range(values: number[]): { min: number; max: number } | null {
  if (!values.length) return null
  let min = Infinity, max = -Infinity
  for (const value of values) { min = Math.min(min, value); max = Math.max(max, value) }
  return { min, max }
}

export function inputRange(rows: { from: string }[]): { min: number; max: number } | null {
  return range(rows.map(row => numeric(row.from)).filter((v): v is number => v !== null))
}

export function coverage(training: TrainingRow[], data: DataRow[]): 'none' | 'covered' | 'partial' {
  const train = inputRange(training), work = inputRange(data)
  if (!train || !work) return 'none'
  return work.min >= train.min && work.max <= train.max ? 'covered' : 'partial'
}

export function validateTraining(rows: TrainingRow[]): string[] {
  const issues: string[] = []
  const ids = new Set<string>()
  for (const [index, row] of rows.entries()) {
    if (!row.id.trim() || ids.has(row.id)) issues.push(`Рядок ${index + 1}: відсутній або повторний ID`)
    ids.add(row.id)
    if (numeric(row.from) === null || numeric(row.to) === null) issues.push(`Рядок ${index + 1}: потрібні числові FROM і TO`)
  }
  if (rows.length < 2) issues.push('Для навчання потрібно мінімум дві пари значень')
  if (new Set(rows.map(row => numeric(row.from)).filter(v => v !== null)).size < 2) {
    issues.push('Потрібно щонайменше два різні значення FROM')
  }
  return issues
}

export function buildRunRequest(training: TrainingRow[], data: DataRow[], method: Method): RunRequest {
  const issues = validateTraining(training)
  const invalidData = data.find(row => numeric(row.from) === null)
  if (invalidData) issues.push(`Робоче значення ID ${invalidData.id}: некоректний FROM`)
  if (issues.length) throw new Error(issues.join('. '))
  const train = training.map(row => ({ id: row.id, from: numeric(row.from)!, to: numeric(row.to)! }))
  const samples = data.map(row => ({ id: row.id, from: numeric(row.from)! }))
  const limits = range([...train.map(p => p.from), ...samples.map(p => p.from)])!
  const spread = limits.max - limits.min || Math.max(1, Math.abs(limits.max) * 0.2)
  return {
    method, training: train, samples,
    curve_range: { min: limits.min - spread * 0.2, max: limits.max + spread * 0.2 },
    curve_samples: 121,
  }
}

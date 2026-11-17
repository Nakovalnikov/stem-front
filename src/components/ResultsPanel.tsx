import { useMemo } from 'react'
import { coverage, inputRange, readable } from '../domain/analysis'
import type { DataRow, Method, ModelResponse, TrainingRow, Unit } from '../domain/types'
import { METHODS } from '../domain/types'
import { MethodIcon } from './MethodIcon'

interface Props {
  method: Method; onMethod: (v: Method) => void; result: ModelResponse | null
  training: TrainingRow[]; data: DataRow[]; unit: Unit
  pending: boolean
}

function fmtRange(range: { min: number; max: number } | null, unit: string) {
  return range ? `${readable(range.min)} – ${readable(range.max)} ${unit}` : 'Н/Д'
}
export default function ResultsPanel({ method, onMethod, result, training, data, unit, pending }: Props) {
  const trainRange = useMemo(() => inputRange(training), [training])
  const dataRange = useMemo(() => inputRange(data), [data])
  const cover = useMemo(() => coverage(training, data), [training, data])
  const methodName = METHODS.find(m=>m.key===method)?.label
  const selectedName = METHODS.find(m=>m.key===result?.selected_method)?.label
  const descriptions: Record<Method, string> = {
    auto: 'Автоматичний вибір',
    rbf: 'Локальна RBF-регресія за гаусовими функціями',
    piecewise: 'Ламана через навчальні точки',
    smooth: 'Локальне згладжування',
    linear: 'Пряма регресії',
    exponential: 'Експоненціальна крива',
  }
  return <aside className="results-panel">
    <div className="results-head"><small>ОБРАНИЙ МЕТОД</small><strong>{methodName}{method==='auto' && result ? ` (${selectedName})` : ''}</strong></div>
    <div className="methods-grid">
      {METHODS.map(item => <button key={item.key} className={`method-button ${method===item.key?'selected':''}`} aria-pressed={method===item.key} onClick={() => onMethod(item.key)} title={descriptions[item.key]}>
        <MethodIcon method={item.key}/><span>{item.label}</span>
      </button>)}
    </div>
    <div className="analytics-title">АНАЛІТИКА</div>
    <div className="analytics-block">
      <label>Навчальне покриття</label><strong>{fmtRange(trainRange, unit)}</strong>
      <label>Робоча область</label><strong>{fmtRange(dataRange, unit)}</strong>
      {cover === 'partial' && <div className="warning-box">Робоча область не покрита навчальними даними.</div>}
      {cover === 'covered' && <div className="success-box">Робоча область покрита.</div>}
      {cover === 'none' && <div className="neutral-box">Недостатньо даних для аналізу покриття.</div>}
    </div>
    <div className="analytics-title">ПОХИБКА НА НАВЧАЛЬНИХ ДАНИХ</div>
    <div className="stat-list">
      <div><span>Середнє відхилення (MAE)</span><strong>{readable(result?.metrics.mae)}</strong></div>
      <div><span>RMSE</span><strong>{readable(result?.metrics.rmse)}</strong></div>
      <div><span>Макс. відхилення</span><strong>{readable(result?.metrics.max_error)}</strong></div>

      <div><span>Навчальних пар</span><strong>{training.length}</strong></div>
      <div><span>Робочих значень</span><strong>{data.length}</strong></div>
    </div>
    {pending && <div className="neutral-box">Обчислюємо…</div>}
    {result?.warnings.map((w,i)=><div key={`${w.code}-${i}`} className={w.severity==='error'?'error-box':'warning-box'}>{w.message}</div>)}
    <div className="result-footer"><span className={`status-dot ${result ? 'online' : ''}`}/>{result?'Модель обчислено':'Очікуємо запуску'}</div>
  </aside>
}

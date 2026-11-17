import { useMemo, useState } from 'react'
import type { DataRow, Mode, TrainingRow } from '../domain/types'
import { numeric } from '../domain/analysis'

type CsvData = { name: string; headers: string[]; rows: string[][]; recommended: Mode }
interface Props {
  csv: CsvData
  existingTraining: TrainingRow[]
  existingData: DataRow[]
  onTraining: (rows: TrainingRow[]) => void
  onData: (rows: DataRow[]) => void
  onClose: () => void
}

export default function ImportDialog({ csv,existingTraining,existingData,onTraining,onData,onClose }: Props) {
  const [dest, setDest] = useState<Mode>(csv.recommended)
  const [action, setAction] = useState<'append'|'replace'>('replace')
  const [part, setPart] = useState<'pair'|'from'|'to'>('pair')
  const [idIndex, setIdIndex] = useState(-1)
  const [fromIndex, setFromIndex] = useState(-1)
  const [toIndex, setToIndex] = useState(-1)
  const [error, setError] = useState('')
  const hasRequiredColumns = dest === 'data' ? fromIndex >= 0
    : part === 'pair' ? fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex
    : idIndex >= 0 && (part === 'from' ? fromIndex >= 0 : toIndex >= 0)
  const options = useMemo(()=>csv.headers.map((header,i)=><option key={i} value={i}>{header}</option>),[csv.headers])

  function importNow() {
    if (!dest) return setError('Виберіть призначення: TRAINING або DATA')
    if (csv.rows.length===0) return setError('CSV не містить записів')
    if (dest==='training' && part==='pair' && (fromIndex === toIndex || fromIndex < 0 || toIndex < 0)) return setError('Потрібні різні колонки FROM і TO')
    if (dest==='training' && part!=='pair' && idIndex<0) return setError('Для двох окремих таблиць TRAINING потрібна спільна колонка ID')
    if ((dest==='data' || part!=='to') && fromIndex<0) return setError('Оберіть FROM')
    if (dest==='training' && part==='to' && toIndex<0) return setError('Оберіть TO')
    const raw = csv.rows.map((values,i)=>({id:idIndex<0?String(i+1):String(values[idIndex]??'').trim(),from:String(values[fromIndex]??'').trim(),to:String(values[toIndex]??'').trim()}))
    if (raw.some(row=>!row.id)) return setError('У CSV є рядки без ID')
    if (new Set(raw.map(r=>r.id)).size!==raw.length) return setError('ID у файлі дублюються')
    if (dest==='data') {
      if (raw.some(r=>numeric(r.from)===null)) return setError('В обраному стовпці FROM є нечислові або порожні значення')
      const old = action==='replace'?[]:existingData
      const used = new Set(old.map(r=>r.id))
      const next = raw.map(row=>{
        const original = row.id; let id=original, index=2
        while(used.has(id)) id=`${original}_${index++}`
        used.add(id); return { id, from:row.from }
      })
      onData([...old,...next])
    } else {
      if ((part!=='to' && raw.some(r=>numeric(r.from)===null)) || (part!=='from' && raw.some(r=>numeric(r.to)===null))) return setError('Колонки FROM / TO мають містити числа')
      const old = action==='replace'?[]:existingTraining
      if (part==='pair') {
        const used = new Set(old.map(r=>r.id))
        const added = raw.map(row=>{
          const original=row.id; let id=original, index=2
          while(used.has(id)) id=`${original}_${index++}`
          used.add(id); return {id,from:row.from,to:row.to}
        })
        onTraining([...old,...added])
      } else {
        const byId = new Map(old.map(r=>[r.id,{...r}]))
        for (const row of raw) {
          const current = byId.get(row.id) ?? {id:row.id,from:'',to:''}
          if (part==='from') current.from=row.from
          else current.to=row.to
          byId.set(row.id,current)
        }
        onTraining([...byId.values()])
      }
    }
    onClose()
  }

  return <div className="app-modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <section className={`app-modal import-app-modal preview-${dest}`} role="dialog" aria-modal="true" aria-label="Імпорт CSV">
      <div className="app-modal-header"><div><div className="eyebrow">ІМПОРТ ТАБЛИЦІ</div><h2>{csv.name}</h2></div><button className="close-button" onClick={onClose}>×</button></div>
      <div className="import-summary"><b>{csv.rows.length}</b> рядків · <b>{csv.headers.length}</b> колонок</div>
      <div className="form-grid">
        <label>Додати до<select value={dest} onChange={e=>setDest(e.target.value as Mode)}><option value="training">TRAINING — навчання</option><option value="data">DATA — обробка</option></select></label>
        <label>Дія<select value={action} onChange={e=>setAction(e.target.value as 'append'|'replace')}><option value="append">Додати до таблиці</option><option value="replace">Замінити таблицю</option></select></label>
        {dest==='training' && <label>Частина набору<select value={part} onChange={e=>setPart(e.target.value as typeof part)}><option value="pair">Пара FROM + TO</option><option value="from">Лише FROM (з ID)</option><option value="to">Лише TO (з ID)</option></select></label>}
        <label>ID<select value={idIndex} onChange={e=>setIdIndex(Number(e.target.value))}><option value={-1}>Не використовувати — нумерувати</option>{options}</select></label>
        {(dest==='data'||part!=='to')&&<label>FROM<select value={fromIndex} onChange={e=>setFromIndex(Number(e.target.value))}><option value={-1} disabled>Оберіть колонку</option>{options}</select></label>}
        {dest==='training'&&part!=='from'&&<label>TO<select value={toIndex} onChange={e=>setToIndex(Number(e.target.value))}><option value={-1} disabled>Оберіть колонку</option>{options}</select></label>}
      </div>
      {dest==='training' && part!=='pair' && <p className="muted small">Рядки з однаковим ID об’єднуються з уже наявними даними. Неповні навчальні пари не можна обчислити до імпорту другої частини.</p>}
      {dest==='training' && part==='pair' && csv.headers.length<2 && <div className="warning-box">У файлі немає другої колонки. Можна перемкнути призначення на DATA або імпортувати окремі колонки за ID.</div>}
      <div className="preview-table"><table className="table table-sm"><thead><tr>{csv.headers.map((h,i)=><th key={i}>{h}</th>)}</tr></thead><tbody>{csv.rows.slice(0,4).map((r,i)=><tr key={i}>{csv.headers.map((_,j)=><td key={j}>{r[j]??''}</td>)}</tr>)}</tbody></table></div>
      {error && <div className="error-box">{error}</div>}
      <div className="app-modal-actions"><button className="btn btn-outline-secondary" onClick={onClose}>Скасувати</button><button className="btn btn-dark" onClick={importNow} disabled={!hasRequiredColumns || csv.rows.length === 0}>Імпортувати</button></div>
    </section>
  </div>
}

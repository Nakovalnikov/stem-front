import { useRef, useState, type DragEvent } from 'react'
import { EditableCell } from './EditableCell'
import { numeric, readable } from '../domain/analysis'
import type { DataRow, Mode, ModelResponse, TrainingRow, Unit } from '../domain/types'
import { UNITS } from '../domain/types'

interface Props {
  mode: Mode; training: TrainingRow[]; data: DataRow[]; result: ModelResponse | null
  unit: Unit; onUnit: (unit: Unit) => void
  onMode: (mode: Mode) => void
  onTraining: (rows: TrainingRow[]) => void
  onData: (rows: DataRow[]) => void
  onRemove: (mode: Mode, id: string) => void
  onImportFile: (file: File, destination: Mode) => void
  onNotify: (message: string) => void
}

function nextId(ids: string[]): string {
  const numbers = ids.map(Number).filter(Number.isFinite)
  return String(numbers.reduce((max, value) => Math.max(max, value), 0) + 1)
}

export default function DataPanel(props: Props) {
  const { mode, training, data, result, unit, onUnit, onMode, onTraining, onData, onRemove, onImportFile, onNotify } = props
  const inputRef = useRef<HTMLInputElement>(null)
  const [from, setFrom] = useState(''), [to, setTo] = useState('')
  const [dragged, setDragged] = useState(false)
  const trainingResult = new Map(result?.training_results.map(row => [row.id, row.deviation]))
  const predictions = new Map(result?.predictions.map(row => [row.id, row.to]))
  const rows = mode === 'training' ? training : data

  function addRow() {
    if (numeric(from) === null || (mode === 'training' && numeric(to) === null)) { onNotify('Введіть коректні числові значення FROM та TO'); return }
    if (mode === 'training') onTraining([...training, { id: nextId(training.map(r => r.id)), from, to }])
    else onData([...data, { id: nextId(data.map(r => r.id)), from }])
    setFrom(''); setTo('')
  }
  function drop(event: DragEvent) {
    event.preventDefault(); setDragged(false)
    const file = event.dataTransfer.files[0]
    if (file) onImportFile(file, mode)
  }
  return <aside className={`data-panel mode-${mode}`} onDragOver={e => { e.preventDefault(); setDragged(true) }} onDragLeave={() => setDragged(false)} onDrop={drop}>
    <div className="panel-tabs" aria-label="Таблиця даних">
      <button className={mode === 'training' ? 'active train-tab' : 'train-tab'} onClick={() => onMode('training')}>TRAINING</button>
      <button className={mode === 'data' ? 'active data-tab' : 'data-tab'} onClick={() => onMode('data')}>DATA</button>
    </div>
    <div className="panel-section-head">
      <strong>{mode === 'training' ? 'Навчальні дані' : 'Робочі дані'}</strong>
    </div>
    <div className="panel-tools">
      <button className="btn btn-sm btn-outline-secondary small-button" onClick={() => inputRef.current?.click()}>↑ Імпорт таблиці</button>
      <input ref={inputRef} type="file" accept=".csv,.tsv,.xlsx,text/csv,text/tab-separated-values" hidden onChange={e => { const f=e.target.files?.[0]; if(f)onImportFile(f,mode); e.target.value='' }} />
      <label className="unit-select">Од. <select aria-label="Одиниця вимірювання" value={unit} onChange={e => onUnit(e.target.value as Unit)}>{UNITS.map(value => <option key={value}>{value}</option>)}</select></label>
    </div>
    <div className="add-row">
      <div className="add-fields">
        <input type="text" inputMode="decimal" value={from} onChange={e => setFrom(e.target.value)} placeholder="FROM" aria-label="Нове значення FROM" onKeyDown={e=>{if(e.key==='Enter'&&mode==='data') addRow()}}/>
        {mode === 'training' && <><span className="arrow-inline">→</span><input type="text" inputMode="decimal" value={to} onChange={e => setTo(e.target.value)} placeholder="TO" aria-label="Нове значення TO" onKeyDown={e=>{if(e.key==='Enter') addRow()}}/></>}
        <button className="add-button" onClick={addRow}>Додати</button>
      </div>
    </div>
    <div className="data-table-wrap">
      <table className="table table-sm data-table">
        <thead><tr><th>ID</th><th>FROM</th><th>TO</th>{mode === 'training' && <th>Δ</th>}<th aria-label="Видалити" /></tr></thead>
        <tbody>
          {mode === 'training' ? training.map(row => <tr key={row.id}>
            <td className="id-cell" title={row.id}>{row.id}</td>
            <td><EditableCell value={row.from} label={`FROM, ID ${row.id}`} onCommit={value => onTraining(training.map(p => p.id === row.id ? { ...p, from: value } : p))}/></td>
            <td><EditableCell value={row.to} label={`TO, ID ${row.id}`} onCommit={value => onTraining(training.map(p => p.id === row.id ? { ...p, to: value } : p))}/></td>
            <td className="result-cell">{readable(trainingResult.get(row.id))}</td>
            <td><button className="delete-button" title="Видалити рядок" aria-label={`Видалити рядок ${row.id}`} onClick={() => onRemove('training',row.id)}>×</button></td>
          </tr>) : data.map(row => <tr key={row.id}>
            <td className="id-cell" title={row.id}>{row.id}</td>
            <td><EditableCell value={row.from} label={`FROM, ID ${row.id}`} onCommit={value => onData(data.map(p => p.id === row.id ? { ...p, from: value } : p))}/></td>
            <td className="result-cell">{readable(predictions.get(row.id))}</td>
            <td><button className="delete-button" title="Видалити рядок" aria-label={`Видалити рядок ${row.id}`} onClick={() => onRemove('data',row.id)}>×</button></td>
          </tr>)}
        </tbody>
      </table>
      {rows.length === 0 && <button className={`empty-drop ${dragged ? 'dragged' : ''}`} onClick={() => inputRef.current?.click()}>
        <span className="drop-symbol">⇧</span>
        <strong>Перетягніть сюди таблицю {mode === 'training' ? 'навчальних' : 'робочих'} даних</strong>
        <small>CSV, TSV, XLSX або додайте значення вище</small>
      </button>}
    </div>
    <div className="data-foot">
      <div><span>Усього записів</span><strong>{rows.length}</strong></div>
      {mode === 'training' && <div><span>Середнє відхилення</span><strong>{readable(result?.metrics.mae)}</strong></div>}
    </div>
  </aside>
}

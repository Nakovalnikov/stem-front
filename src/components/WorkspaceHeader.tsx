import { Link } from 'react-router-dom'
import { APP_NAME } from '../domain/branding'
import type { GraphSettings } from '../domain/types'
import { useEffect, useRef, useState, type ChangeEvent, type RefObject } from 'react'

interface Props {
  name: string; onName: (name: string) => void; run: () => void
  runState: 'disabled'|'idle'|'ready'|'waiting'|'warning'|'error'
  onSettings: () => void; onNewProject: () => void
  valueLabels: GraphSettings['valueLabels']
  onValueLabels: (value: GraphSettings['valueLabels']) => void
  onExportTraining: () => void; onExportData: () => void
  onExportResults: () => void; onExportJson: () => void
  onExportPng: () => void; onExportModel: () => void
  projectFileRef: RefObject<HTMLInputElement | null>; onImportProject: (file: File) => void
}

export default function WorkspaceHeader(p: Props) {
  const [editing, setEditing] = useState(false)
  const [openMenu,setOpenMenu] = useState<'file'|'model'|'view'|null>(null)
  const menuBar = useRef<HTMLElement>(null)
  useEffect(() => {
    function close(e: MouseEvent) { if (menuBar.current && !menuBar.current.contains(e.target as Node)) setOpenMenu(null) }
    document.addEventListener('pointerdown',close)
    return () => document.removeEventListener('pointerdown',close)
  }, [])
  function menuAction(action: () => void) { setOpenMenu(null); action() }
  const [draft, setDraft] = useState(p.name)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) input.current?.focus() }, [editing])
  function beginRename() { setDraft(p.name); setEditing(true) }
  function applyRename() {
    const name = draft.trim()
    if (name) p.onName(name)
    setEditing(false)
  }
  const stateLabel = p.runState==='waiting'?'Обчислюємо…':p.runState==='error'?'Помилка': 'Запустити модель'
  return <header className="workspace-header">
    <div className="top-line">
      <div className="model-name-group">
        <span className="model-caption">Модель:</span>
        {editing ? <input ref={input} id="model-name" value={draft} maxLength={80}
          onChange={e=>setDraft(e.target.value)}
          onKeyDown={e=>{if(e.key==='Enter')applyRename();if(e.key==='Escape')setEditing(false)}}
          onBlur={()=>setEditing(false)} aria-label="Нова назва моделі" title="Enter — зберегти, Esc — скасувати"/>
          : <strong className="model-title" title={p.name}>{p.name}</strong>}
        <button type="button" className="model-pencil" onClick={editing?applyRename:beginRename}
          onMouseDown={e=>{if(editing)e.preventDefault()}}
          aria-label={editing?'Зберегти назву моделі':'Редагувати назву моделі'}
          title={editing?'Зберегти назву':'Редагувати назву'}>{editing?'✓':'✎'}</button>
      </div>
      <Link to="/" className="work-brand" title="На головну">{APP_NAME}</Link>
      <div className="header-icons"><button disabled title="Поділитися (в розробці)">↗</button><Link to="/guide" target="_blank" rel="noopener noreferrer" title="Посібник">?</Link><button title="Налаштування" onClick={p.onSettings}>⚙</button></div>
    </div>
    <div className="menu-line">
      <nav ref={menuBar} className="menu-groups" aria-label="Основне меню">
        <details className="menu-dropdown" open={openMenu==='file'}><summary onClick={e=>{e.preventDefault();setOpenMenu(v=>v==='file'?null:'file')}}>Файл</summary><div className="menu-list">
          <button onClick={()=>menuAction(p.onNewProject)}>Нова модель</button><hr/>
          <button onClick={()=>menuAction(p.onExportTraining)}>Експорт TRAINING.csv</button>
          <button onClick={()=>menuAction(p.onExportData)}>Експорт DATA.csv (вхідні)</button>
          <button onClick={()=>menuAction(p.onExportResults)}>Експорт DATA.csv (вхідні + результат)</button>
          <hr/>
          <button onClick={()=>menuAction(p.onExportPng)}>Зберегти графіки PNG</button>
          <hr/>
          <button onClick={()=>menuAction(p.onExportJson)}>Експорт проєкту JSON</button>
          <button onClick={()=>menuAction(()=>p.projectFileRef.current?.click())}>Відкрити проєкт JSON</button>
          <input type="file" accept=".json,application/json" hidden ref={p.projectFileRef} onChange={(e:ChangeEvent<HTMLInputElement>)=>{const f=e.target.files?.[0]; if(f)p.onImportProject(f);e.target.value=''}}/>
        </div></details>
        <details className="menu-dropdown" open={openMenu==='model'}><summary onClick={e=>{e.preventDefault();setOpenMenu(v=>v==='model'?null:'model')}}>Модель</summary><div className="menu-list">
          <button onClick={()=>menuAction(p.onExportModel)}>Завантажити параметри</button>
          <button disabled title="У наступній версії">Поділитися параметрами</button>
          <a href="https://github.com/Nakovalnikov/stem-front" target="_blank" rel="noopener noreferrer" onClick={()=>setOpenMenu(null)}>Застосунок для інтерполяції</a>
        </div></details>
        <details className="menu-dropdown" open={openMenu==='view'}><summary onClick={e=>{e.preventDefault();setOpenMenu(v=>v==='view'?null:'view')}}>Вигляд</summary><div className="menu-list">
          <button onClick={() => menuAction(p.onSettings)}>Налаштування графіка…</button>
          <hr />
          <button onClick={() => menuAction(() => p.onValueLabels('off'))}>
            {p.valueLabels === 'off' ? '✓ ' : ''}Без підписів Y
          </button>
          <button onClick={() => menuAction(() => p.onValueLabels('small'))}>
            {p.valueLabels === 'small' ? '✓ ' : ''}Дрібні підписи Y
          </button>
          <button onClick={() => menuAction(() => p.onValueLabels('large'))}>
            {p.valueLabels === 'large' ? '✓ ' : ''}Великі підписи Y
          </button>
        </div></details>
      </nav>
      <button className={`run-button ${p.runState}`} disabled={p.runState==='disabled'||p.runState==='waiting'} onClick={p.run}>{stateLabel}</button>
    </div>
  </header>
}

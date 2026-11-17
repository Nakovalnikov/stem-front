import { useEffect, useRef, useState } from 'react'
import DataPanel from '../components/DataPanel'
import GraphCanvas from '../components/GraphCanvas'
import ResultsPanel from '../components/ResultsPanel'
import WorkspaceHeader from '../components/WorkspaceHeader'
import ImportDialog from '../components/ImportDialog'
import SettingsDialog from '../components/SettingsDialog'
import { useProject } from '../hooks/useProject'
import { buildRunRequest, coverage } from '../domain/analysis'
import { csvContent } from '../domain/csv'
import { readTableFile, type TableCells } from '../domain/spreadsheet'
import { parseProject } from '../domain/storage'
import { downloadText, exportSvgPng, safeFilename } from '../utils/download'
import { downloadModelFromServer, runModel } from '../api/modelApi'
import type { Mode, Unit } from '../domain/types'

const EXPORT_SIZE = { width: 1200, height: 760 }

type ImportState = { name: string; headers: string[]; rows: string[][]; recommended: Mode }

export default function WorkspacePage() {
  const p = useProject()
  // У StrictMode ініціалізація може викликатися двічі; параметр new
  // прибираємо після монтування, а не під час відновлення проєкту.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('new')) {
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])
  const {project,result,pending,error,dirty} = p
  const [importCsv,setImportCsv] = useState<ImportState | null>(null)
  const [settingsOpen,setSettingsOpen] = useState(false)
  const [mobilePanel,setMobilePanel] = useState<'graph'|'data'|'results'>('graph')
  const projectFileRef = useRef<HTMLInputElement>(null)
  // Застаріла відповідь сервера не повинна замінити поточну модель.
  const revisionRef = useRef(0)
  function changeTraining(rows: typeof project.training) { revisionRef.current++; p.changeTraining(rows) }
  function changeData(rows: typeof project.data) { revisionRef.current++; p.changeData(rows) }
  function changeMethod(method: typeof project.method) { revisionRef.current++; p.changeMethod(method) }
  const filename = safeFilename(project.name)

  function notify(message: string) { p.setMessage(message); p.setUndo(null) }

  async function openTable(file: File, recommended: Mode) {
    try {
      const {headers,rows} = await readTableFile(file)
      setImportCsv({name:file.name,headers,rows,recommended})
    } catch (e) { notify(e instanceof Error?e.message:'Не вдалося прочитати таблицю') }
  }

  async function run() {
    const revision = ++revisionRef.current
    p.setError(''); p.setPending(true)
    try {
      const request = buildRunRequest(project.training,project.data,project.method)
      const response = await runModel(request)
      if (revision===revisionRef.current) { p.setResult(response);p.setDirty(false) }
    } catch (e) { if (revision===revisionRef.current) { p.setResult(null);p.setError(e instanceof Error?e.message:'Помилка обробки');p.setDirty(true) } }
    finally { if (revision === revisionRef.current) p.setPending(false) }
  }

  const warn = coverage(project.training,project.data)==='partial'
    || result?.warnings.some(w=>w.severity==='error' || (w.severity==='warning'))
  const runState = pending ? 'waiting' : error ? 'error' : project.training.length < 2 ? 'disabled' : (warn ? 'warning' : (!dirty && result?'idle':'ready'))
  // Після зміни DATA наступний запуск також перевчає модель.

  function exportRows(kind: 'training'|'data'|'results'): TableCells | null {
    if (kind==='training') return [['ID','FROM','TO'],...project.training.map(r=>[r.id,r.from,r.to])]
    if (kind==='data') return [['ID','FROM'],...project.data.map(r=>[r.id,r.from])]
    const byId = new Map(result?.predictions.map(r=>[r.id,r.to]))
    if (!result || byId.size===0) {
      notify('Спочатку запустіть модель для робочих даних')
      return null
    }
    return [['ID','FROM','TO'],...project.data.map(r=>[r.id,r.from,byId.get(r.id)])]
  }

  function exportCsv(kind: 'training'|'data'|'results') {
    const rows = exportRows(kind)
    if (!rows) return
    const suffix = kind === 'training' ? 'training' : kind === 'data' ? 'data' : 'data-input-result'
    downloadText(csvContent(rows),`${filename}-${suffix}.csv`,'text/csv;charset=utf-8')
  }

  async function importProject(file: File) {
    try {revisionRef.current++;p.setPending(false);p.loadProject(parseProject(await file.text()));notify(`Відкрито проєкт: ${file.name}`)}
    catch(e){notify(e instanceof Error?e.message:'Невірний JSON')}
  }

  async function exportBothPng() {
    const training = document.querySelector<SVGSVGElement>('#workspace-export-training')
    const data = document.querySelector<SVGSVGElement>('#workspace-export-data')
    if (!training || !data) return notify('Графіки ще не готові до збереження')
    try {
      // Один і той самий автоматичний кадр (5% полів) для обох файлів.
      await exportSvgPng(training, `${filename}-training.png`)
      await exportSvgPng(data, `${filename}-data.png`)
      notify('Збережено два графіки: TRAINING та DATA')
    } catch (e) { notify(e instanceof Error ? e.message : 'Помилка експорту PNG') }
  }

  async function exportModel() {
    if (!result) return notify('Спочатку запустіть модель на актуальних навчальних даних')
    try {
      const data = await downloadModelFromServer()
      downloadText(data, `${filename}-model.json`, 'application/json')
    } catch(e){notify(e instanceof Error?e.message:'Не вдалося завантажити модель')}
  }


  return <div className="workspace-page">
    <WorkspaceHeader
      name={project.name} onName={name=>p.setProject(old=>({...old,name}))}
      run={run} runState={runState} onSettings={()=>setSettingsOpen(true)}
      valueLabels={project.graphSettings.valueLabels}
      onValueLabels={valueLabels => p.setProject(old => ({
        ...old,
        graphSettings: { ...old.graphSettings, valueLabels },
      }))}
      onNewProject={()=>window.open('/workspace?new=1', '_blank', 'noopener,noreferrer')}
      onExportTraining={()=>exportCsv('training')}
      onExportData={()=>exportCsv('data')}
      onExportResults={()=>exportCsv('results')}
      onExportJson={()=>downloadText(JSON.stringify(project,null,2),`${filename}-project.json`,'application/json')}
      onExportPng={exportBothPng}
      onExportModel={exportModel}
      projectFileRef={projectFileRef} onImportProject={importProject}
    />
    {error && <div className="workspace-notice" role="alert">
      <span className="inline-error">{error}</span>
    </div>}
    <div className="mobile-panel-switcher" aria-label="Перемикання панелей">
      <button className={mobilePanel==='data'?'chosen':''} onClick={()=>setMobilePanel('data')}>Таблиця</button>
      <button className={mobilePanel==='graph'?'chosen':''} onClick={()=>setMobilePanel('graph')}>Графік</button>
      <button className={mobilePanel==='results'?'chosen':''} onClick={()=>setMobilePanel('results')}>Аналітика</button>
    </div>
    <div className={`workspace-grid mobile-show-${mobilePanel}`}>
      <DataPanel mode={project.tableMode} training={project.training} data={project.data} result={result}
        unit={project.unit} onUnit={(unit:Unit)=>p.setProject(old=>({...old,unit}))}
        onMode={mode=>p.changeMode('tableMode',mode)}
        onTraining={changeTraining} onData={changeData}
        onRemove={(mode,id)=>{revisionRef.current++;p.setPending(false);p.removeRow(mode,id)}}
        onImportFile={openTable} onNotify={notify}
      />
      <GraphCanvas mode={project.graphMode} onMode={mode=>p.changeMode('graphMode',mode)}
        training={project.training} data={project.data} result={result}
        pending={pending} error={error} settings={project.graphSettings} unit={project.unit}
        camera={project.camera}
        onCamera={camera=>p.setProject(old=>({...old,camera}))}
      />
      <ResultsPanel method={project.method} onMethod={changeMethod} result={result}
        training={project.training} data={project.data} unit={project.unit} pending={pending}/>
    </div>
    <div className="export-only" aria-hidden="true">
      {(['training','data'] as const).map(mode => <GraphCanvas key={mode} mode={mode} onMode={()=>{}}
        training={project.training} data={project.data} result={result}
        settings={project.graphSettings} camera={{ ...project.camera, manual:false, padding:0.05 }}
        onCamera={()=>{}} pending={false} error="" unit={project.unit} exportSize={EXPORT_SIZE} />)}
    </div>
    {p.message && <div className="app-toast" role="status"><span>{p.message}</span>{p.undo && <button onClick={() => { revisionRef.current++; p.setPending(false); p.undo?.() }}>Скасувати</button>}<button onClick={()=>{p.setMessage('');p.setUndo(null)}} aria-label="Закрити">×</button></div>}
    {importCsv && <ImportDialog csv={importCsv} existingTraining={project.training} existingData={project.data}
      onTraining={changeTraining} onData={changeData} onClose={()=>setImportCsv(null)}/>}
    {settingsOpen && <SettingsDialog value={project.graphSettings} onChange={graphSettings=>p.setProject(old=>({...old,graphSettings}))} onClose={()=>setSettingsOpen(false)}/>}
  </div>
}

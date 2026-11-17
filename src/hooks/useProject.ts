import { useEffect, useState } from 'react'
import { restoreProject, storeProject } from '../domain/storage'
import type { ProjectState, TrainingRow, DataRow, ModelResponse, Method, Mode } from '../domain/types'

export function useProject() {
  const [project, setProject] = useState<ProjectState>(restoreProject)
  const [result, setResult] = useState<ModelResponse | null>(null)
  const [dirty, setDirty] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [undo, setUndo] = useState<(() => void) | null>(null)

  useEffect(() => {
    try { storeProject(project) }
    catch { /* браузер може заборонити збереження; користувач може експортувати JSON */ }
  }, [project])

  function refitIfAutomatic(old: ProjectState): ProjectState['camera'] {
    return old.camera.manual ? old.camera : { ...old.camera, padding: 0.1 }
  }
  function changeTraining(rows: TrainingRow[]) {
    setProject(old => ({ ...old, training: rows, camera: refitIfAutomatic(old) }))
    setResult(null); setDirty(true); setError('')
  }
  function changeData(rows: DataRow[]) {
    setProject(old => ({ ...old, data: rows, camera: refitIfAutomatic(old) }))
    setResult(null)
    setDirty(true); setError('')
  }
  function changeMethod(method: Method) {
    setProject(old => ({ ...old, method }))
    setResult(null); setDirty(true); setError('')
  }
  function changeMode(kind: 'tableMode' | 'graphMode', mode: Mode) {
    setProject(old => ({ ...old, [kind]: mode }))
  }
  function loadProject(value: ProjectState) {
    setProject(value); setResult(null); setDirty(true); setError('')
  }
  function removeRow(mode: Mode, id: string) {
    if (mode === 'training') {
      const oldRows = project.training
      changeTraining(oldRows.filter(row => row.id !== id))
      setUndo(() => () => { changeTraining(oldRows); setUndo(null); setMessage('Видалення скасовано') })
    } else {
      const oldRows = project.data
      changeData(oldRows.filter(row => row.id !== id))
      setUndo(() => () => { changeData(oldRows); setUndo(null); setMessage('Видалення скасовано') })
    }
    setMessage('Рядок видалено')
  }
  return {
    project, setProject, result, setResult, dirty, setDirty,
    pending, setPending, error, setError, message, setMessage, undo, setUndo,
    changeTraining, changeData, changeMethod, changeMode, loadProject, removeRow,
  }
}

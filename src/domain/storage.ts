import { METHODS, newProject } from './types'
import type { ProjectState } from './types'

const KEY = 'myProjectStorage'
const LEGACY_KEY = 'stem.measurement.project.v1'

function storedProject(): string | null {
  return localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY)
}

export function hasCurrentProject(): boolean {
  try {
    const raw = storedProject()
    if (!raw) return false
    const state = parseProject(raw)
    return state.training.length > 0 || state.data.length > 0 || state.name !== newProject().name
  } catch { return false }
}

export function restoreProject(): ProjectState {
  if (new URLSearchParams(window.location.search).get('new') === '1') {
    return newProject()
  }
  try {
    const stored = storedProject()
    if (!stored) return newProject()
    return parseProject(stored)
  } catch { return newProject() }
}

export function parseProject(json: string): ProjectState {
  const obj: unknown = JSON.parse(json)
  if (!obj || typeof obj !== 'object') throw new Error('Невірний JSON проєкту')
  const doc = obj as Partial<ProjectState>
  if (doc.version !== 1 || !Array.isArray(doc.training) || !Array.isArray(doc.data)) {
    throw new Error('Непідтримуваний формат файлу проєкту')
  }
  const initial = newProject()
  const old = doc as Partial<ProjectState> & { cameras?: { training?: ProjectState['camera'] } }
  const ratio = Number(doc.graphSettings?.aspectRatio)
  const valueLabels = doc.graphSettings?.valueLabels
  const savedMethod: unknown = doc.method
  const state: ProjectState = {
    ...initial, ...doc,
    method: savedMethod === 'polynomial' ? 'rbf' : (METHODS.find(m => m.key === savedMethod)?.key ?? 'auto'),
    training: doc.training.filter(row => typeof row?.id === 'string' && typeof row?.from === 'string' && typeof row?.to === 'string'),
    data: doc.data.filter(row => typeof row?.id === 'string' && typeof row?.from === 'string'),
    camera: { ...initial.camera, ...(doc.camera ?? old.cameras?.training) },
    graphSettings: { ...initial.graphSettings, ...doc.graphSettings,
      aspectRatio: Number.isFinite(ratio) && ratio > 0 ? ratio : 1,
      valueLabels: valueLabels === 'small' || valueLabels === 'large' ? valueLabels : 'off',
    },
  }
  delete (state as unknown as { cameras?: unknown }).cameras // Застарілий формат v3
  return state
}

export function storeProject(state: ProjectState) {
  localStorage.setItem(KEY, JSON.stringify(state))
}

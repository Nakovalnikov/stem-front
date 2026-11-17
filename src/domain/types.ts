export type Method = 'auto' | 'rbf' | 'piecewise' | 'smooth' | 'linear' | 'exponential'
export type Mode = 'training' | 'data'
export type Unit = 'од.' | 'г' | 'кг' | 'т' | '°C' | 'мм' | 'см' | 'м' | 'км'

export type TrainingRow = { id: string; from: string; to: string }
export type DataRow = { id: string; from: string }
export type TrainingResult = { id: string; predicted: number; deviation: number | null }
export type Prediction = { id: string; to: number }
export type CurvePoint = { x: number; y: number }
export type ApiWarning = { code: string; message: string; severity: 'warning' | 'error' }

export interface ModelResponse {
  requested_method: Method
  selected_method: Exclude<Method, 'auto'>
  model: { kind: string; parameters: Record<string, unknown> }
  training_results: TrainingResult[]
  predictions: Prediction[]
  curve: CurvePoint[]
  metrics: { mae: number | null; rmse: number | null; max_error: number | null; evaluation_count: number }
  warnings: ApiWarning[]
}

export interface RunRequest {
  method: Method
  training: { id: string; from: number; to: number }[]
  samples: { id: string; from: number }[]
  curve_range: { min: number; max: number }
  curve_samples: number
}

export interface GraphCamera {
  centerX: number
  centerY: number
  scaleX: number
  scaleY: number
  manual: boolean
  padding: number
}
export interface GraphSettings {
  showGrid: boolean
  aspectRatio: number
  pointSize: number
  lineWidth: number
  valueLabels: 'off' | 'small' | 'large'
}

export interface ProjectState {
  version: 1
  name: string
  unit: Unit
  method: Method
  tableMode: Mode
  graphMode: Mode
  training: TrainingRow[]
  data: DataRow[]
  graphSettings: GraphSettings
  camera: GraphCamera
}

export const METHODS: { key: Method; label: string }[] = [
  { key: 'auto', label: 'Авто' },
  { key: 'rbf', label: 'RBF-крива' },
  { key: 'piecewise', label: 'Ламана' },
  { key: 'smooth', label: 'Ковзне вікно' },
  { key: 'linear', label: 'Пряма' },
  { key: 'exponential', label: 'Експоненціальна' },
]
export const UNITS: Unit[] = ['од.', 'г', 'кг', 'т', '°C', 'мм', 'см', 'м', 'км']

const newCamera = (): GraphCamera => ({ centerX: 0, centerY: 0, scaleX: 1, scaleY: 1, manual: false, padding: 0.2 })
export function newProject(): ProjectState {
  return {
    version: 1,
    name: 'Нова модель',
    unit: 'од.', method: 'auto', tableMode: 'training', graphMode: 'training',
    training: [], data: [],
    graphSettings: { showGrid: true, aspectRatio: 1, pointSize: 4, lineWidth: 2, valueLabels: 'off' },
    camera: newCamera(),
  }
}

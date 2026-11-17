import type { ModelResponse, RunRequest } from '../domain/types'

// Якщо фронтенд відкрито з телефона, використовуємо адресу того самого хоста.
const BASE = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8000`

function checkResponse(value: unknown): asserts value is ModelResponse {
  if (!value || typeof value !== 'object') throw new Error('Сервер повернув неправильний формат відповіді')
  const v = value as Partial<ModelResponse>
  if (!Array.isArray(v.curve) || !Array.isArray(v.predictions) || !Array.isArray(v.training_results) || !v.metrics) {
    throw new Error('Сервер не повернув необхідні результати')
  }
}

export async function runModel(request: RunRequest): Promise<ModelResponse> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 30000)
  try {
    const response = await fetch(`${BASE}/api/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    })
    const data: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      const detail = data && typeof data === 'object' && 'detail' in data ? String(data.detail) : `HTTP ${response.status}`
      throw new Error(detail)
    }
    checkResponse(data)
    return data
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('Час очікування сервера вичерпано')
    if (error instanceof TypeError) throw new Error('Не вдалося з’єднатися із сервером.')
    throw error
  } finally { window.clearTimeout(timeout) }
}

export async function downloadModelFromServer(): Promise<string> {
  const response = await fetch(`${BASE}/api/model/export`)
  if (!response.ok) throw new Error('Модель на сервері недоступна. Спочатку натисніть «Запустити модель».')
  return JSON.stringify(await response.json(), null, 2)
}

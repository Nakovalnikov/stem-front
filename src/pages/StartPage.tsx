import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { APP_NAME } from '../domain/branding'
import { hasCurrentProject, parseProject, storeProject } from '../domain/storage'

export default function StartPage() {
  const navigate = useNavigate()
  const fileInput = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const canContinue = hasCurrentProject()

  async function openJson(file: File) {
    try {
      const project = parseProject(await file.text())
      storeProject(project)
      navigate('/workspace')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не вдалося відкрити проєкт')
    }
  }

  return (
    <div className="start-page">
      <header className="home-nav">
        <Link className="wordmark" to="/">{APP_NAME}</Link>
        <Link to="/guide">Посібник</Link>
      </header>
      <main className="start-main">
        <div className="eyebrow">КОРЕКЦІЯ ВИМІРЮВАНЬ</div>
        <h1>Початок роботи</h1>
        <p>Створіть нову роботу, продовжте поточну або відкрийте збережений JSON.</p>
        <div className="start-options">
          <Link to="/workspace?new=1" className="start-option">
            <span className="start-option-icon">＋</span>
            <strong>Створити нову</strong>
            <span>Порожні таблиці TRAINING і DATA</span>
          </Link>
          {canContinue ? (
            <Link to="/workspace" className="start-option">
              <span className="start-option-icon">↗</span>
              <strong>Продовжити поточну</strong>
              <span>Остання робота у цьому браузері</span>
            </Link>
          ) : (
            <div className="start-option disabled" aria-disabled="true">
              <span className="start-option-icon">↗</span>
              <strong>Продовжити поточну</strong>
              <span>Немає збереженої роботи</span>
            </div>
          )}
          <button type="button" className="start-option" onClick={() => fileInput.current?.click()}>
            <span className="start-option-icon">⇩</span>
            <strong>Відкрити проєкт JSON</strong>
            <span>Імпорт збереженої роботи</span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={event => {
              const file = event.target.files?.[0]
              if (file) void openJson(file)
              event.target.value = ''
            }}
          />
        </div>
        {error && <p className="error-box" role="alert">{error}</p>}
        <p className="start-note">Зберігається одна поточна робота. Перед створенням нової експортуйте попередню в JSON.</p>
      </main>
    </div>
  )
}

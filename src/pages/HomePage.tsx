import { Link } from 'react-router-dom'
import { APP_NAME } from '../domain/branding'

export default function HomePage() {
  return <div className="home-page">
    <header className="home-nav">
      <Link className="wordmark" to="/">{APP_NAME}</Link>
      <nav><Link to="/guide">Посібник</Link><Link className="btn btn-dark" to="/start">Відкрити робочу область →</Link></nav>
    </header>
    <main className="home-main">
      <div className="eyebrow">АНАЛІЗ І КОРЕКЦІЯ ВИМІРЮВАНЬ</div>
      <h1>Корекція цифрових вимірювань.</h1>
      <p className="home-lead">Інтерактивне середовище для підготовки вимірювань, навчання моделі корекції та порівняння вихідних і скоригованих значень.</p>
      <div className="home-actions">
        <Link className="btn btn-dark btn-lg" to="/start">Розпочати роботу <span>↗</span></Link>
        <Link className="btn btn-outline-secondary btn-lg" to="/guide">Як користуватися</Link>
      </div>
      <div className="home-preview" aria-label="Попередній перегляд можливостей">
        <div className="preview-heading"><strong>TRAINING</strong><small>FROM → TO</small><span>МЕТОД: АВТО</span></div>
        <svg viewBox="0 0 900 260" role="img" aria-label="Приклад графіка корекції">
          {Array.from({ length: 9 }, (_, i) => <line key={`v${i}`} x1={40 + i * 100} x2={40 + i * 100} y1="20" y2="220" stroke="#dce1e7"/>)}
          {Array.from({ length: 5 }, (_, i) => <line key={`h${i}`} x1="40" x2="850" y1={20 + i * 50} y2={20 + i * 50} stroke="#dce1e7"/>)}
          <path d="M65 205 L820 34" fill="none" stroke="var(--graph-train-input)" strokeWidth="3" strokeDasharray="8 7"/>
          <path d="M65 201 C260 171 320 173 480 124 S720 55 820 36" fill="none" stroke="var(--graph-model)" strokeWidth="4"/>
          {[[130,187],[240,174],[350,145],[470,126],[610,89],[744,55]].map(([x,y],i) => <circle key={i} cx={x} cy={y} r="5" fill="var(--graph-reference)"/>)}
        </svg>
        <div className="preview-legend"><span><i className="legend-dot orange"/> Вхідні значення</span><span><i className="legend-dot teal"/> Еталонні точки</span><span><i className="legend-dot green"/> Модель корекції</span></div>
      </div>
    </main>
    <footer className="home-footer"><span>Навчальний проєкт · Київський національний університет імені Тараса Шевченка</span><span>Розробник: Тимур Лєтов</span></footer>
  </div>
}

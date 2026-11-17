import { useEffect, useState } from 'react'
import type { GraphSettings } from '../domain/types'
interface Props { value: GraphSettings; onChange: (value: GraphSettings) => void; onClose: () => void }
export default function SettingsDialog({ value, onChange, onClose }: Props) {
  const [aspect, setAspect] = useState(String(value.aspectRatio))
  useEffect(() => setAspect(String(value.aspectRatio)), [value.aspectRatio])
  function applyAspect() {
    const ratio = Number(aspect.replace(',', '.'))
    if (Number.isFinite(ratio) && ratio > 0) set('aspectRatio', Math.max(0.01, Math.round(ratio * 100) / 100))
    else setAspect(String(value.aspectRatio))
  }
  function set<K extends keyof GraphSettings>(key: K, next: GraphSettings[K]) { onChange({ ...value, [key]: next }) }
  return <div className="app-modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <section className="app-modal settings-app-modal" role="dialog" aria-modal="true" aria-label="Налаштування вигляду">
      <div className="app-modal-header"><h2>Налаштування вигляду</h2><button className="close-button" onClick={onClose}>×</button></div>
      <label className="check-row"><input type="checkbox" checked={value.showGrid} onChange={e=>set('showGrid',e.target.checked)}/> Показувати сітку</label>
      <label className="setting-row">Співвідношення масштабу осей (1 : ?)
        <input className="aspect-input" type="number" min="0.01" step="0.01" value={aspect}
          onChange={e=>setAspect(e.target.value)} onBlur={applyAspect}
          onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}}
          aria-label="Співвідношення масштабу осей 1 до" />
      </label>
      <label className="setting-row">Товщина ліній<select value={value.lineWidth} onChange={e=>set('lineWidth',Number(e.target.value))}><option value={0}>Приховати</option><option value={1}>Тонкі</option><option value={2}>Звичайні</option><option value={4}>Товсті</option></select></label>
      <label className="setting-row">Розмір точок<select value={value.pointSize} onChange={e=>set('pointSize',Number(e.target.value))}><option value={0}>Приховати</option><option value={2}>Малі</option><option value={4}>Середні</option><option value={6}>Великі</option></select></label>
      
      <label className="setting-row">Підписи значень Y
        <select value={value.valueLabels} onChange={e => set('valueLabels', e.target.value as GraphSettings['valueLabels'])}>
          <option value="off">Приховати</option>
          <option value="small">Дрібні</option>
          <option value="large">Великі</option>
        </select>
      </label>
      <div className="app-modal-actions"><button className="btn btn-dark" onClick={onClose}>Готово</button></div>
    </section>
  </div>
}

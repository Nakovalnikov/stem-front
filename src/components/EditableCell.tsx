import { useEffect, useState } from 'react'

interface Props { value: string; onCommit: (value: string) => void; label: string }

export function EditableCell({ value, onCommit, label }: Props) {
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])
  function commit() {
    const normalized = draft.trim().replace(',', '.')
    if (normalized !== value) onCommit(normalized)
  }
  return <input
    className="cell-input" aria-label={label} inputMode="decimal" type="text"
    value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit}
    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(value); e.currentTarget.blur() } }}
  />
}

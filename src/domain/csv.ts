/** Невеликий CSV-парсер із підтримкою лапок, перенесень рядків та роздільників. */
export function parseCsv(source: string): { headers: string[]; rows: string[][] } {
  const firstLine = source.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] || ''
  const candidates = [',', ';', '\t']
  const delimiter = candidates.sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0]
  const lines: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  const text = source.replace(/^\uFEFF/, '')
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++ }
      else quoted = !quoted
    } else if (char === delimiter && !quoted) {
      row.push(cell); cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some(value => value.trim())) lines.push(row)
      row = []
    } else cell += char
  }
  if (quoted) throw new Error('Незакриті лапки в CSV')
  row.push(cell)
  if (row.some(value => value.trim())) lines.push(row)
  if (!lines.length) throw new Error('Файл CSV порожній')
  return { headers: lines[0].map((v, i) => v.trim() || `Колонка ${i + 1}`), rows: lines.slice(1) }
}

export function csvContent(rows: (string | number | null | undefined)[][]): string {
  const escape = (v: string | number | null | undefined) => {
    const s = String(v ?? '')
    return /[",;\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
  }
  return '\uFEFF' + rows.map(row => row.map(escape).join(',')).join('\r\n')
}

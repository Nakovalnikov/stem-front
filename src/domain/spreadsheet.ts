import { parseCsv } from './csv'

export type TableCells = (string | number | null | undefined)[][]
export type ImportedTable = { headers: string[]; rows: string[][] }

/** Один формат даних для CSV/TSV та XLSX. Валідація FROM/TO — в ImportDialog. */
export async function readTableFile(file: File): Promise<ImportedTable> {
  if (file.size > 30 * 1024 * 1024) throw new Error('Розмір файлу перевищує 30 МБ')
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'csv' || ext === 'tsv' || ext === 'txt') return parseCsv(await file.text())
  if (ext !== 'xlsx') throw new Error('Підтримувані формати: CSV, TSV, XLSX')

  // Завантажуємо важку бібліотеку лише під час роботи з Excel.
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const buffer = new Uint8Array(await file.arrayBuffer())
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0])
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error('Файл Excel не містить аркушів')

  const values: string[][] = []
  sheet.eachRow({ includeEmpty: false }, row => {
    const cells = Array.from({ length: sheet.columnCount }, (_, i) => row.getCell(i + 1).text.trim())
    if (cells.some(Boolean)) values.push(cells)
  })
  if (!values.length) throw new Error('Аркуш Excel порожній')
  return {
    headers: values[0].map((cell, i) => cell || `Колонка ${i + 1}`),
    rows: values.slice(1),
  }
}

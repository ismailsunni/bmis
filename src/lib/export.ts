import * as XLSX from 'xlsx'

/** Exports are generated in the browser; nothing is uploaded anywhere. */
export function exportXLSX(rows: Record<string, unknown>[], filename: string, sheetName = 'Data') {
  const sheet = XLSX.utils.json_to_sheet(rows)
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, sheetName.slice(0, 31))
  XLSX.writeFile(book, `${filename}.xlsx`)
}

export async function readSheet(file: File): Promise<Record<string, unknown>[]> {
  const buffer = await file.arrayBuffer()
  const book = XLSX.read(buffer, { type: 'array', cellDates: true })
  const first = book.Sheets[book.SheetNames[0]]
  return XLSX.utils.sheet_to_json(first, { defval: null })
}

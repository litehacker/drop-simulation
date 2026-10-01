export function saveFile(filename: string, data: string | Uint8Array, type: string): void {
  const payload = typeof data === 'string' ? data : new Uint8Array(data)
  const blob = new Blob([payload], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

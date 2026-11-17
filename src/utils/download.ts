export function downloadBlob(content: Blob, filename: string) {
  const url = URL.createObjectURL(content)
  const link = document.createElement('a')
  link.href = url; link.download = filename
  document.body.appendChild(link); link.click(); link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadText(content: string, filename: string, type = 'text/plain;charset=utf-8') {
  downloadBlob(new Blob([content], { type }), filename)
}

export function safeFilename(text: string) {
  return text.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60) || 'stem'
}

/** Експорт PNG з SVG через Canvas. */
export async function exportSvgPng(svg: SVGSVGElement, filename: string) {
  const clone = svg.cloneNode(true) as SVGSVGElement
  const bounds = svg.viewBox.baseVal
  const width = bounds.width || 1200, height = bounds.height || 750
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  background.setAttribute('width', '100%'); background.setAttribute('height', '100%')
  background.setAttribute('fill', '#ffffff')
  clone.insertBefore(background, clone.firstChild)
  const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = width * 2; canvas.height = height * 2
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas недоступний')
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Помилка PNG')), 'image/png'))
    downloadBlob(png, filename)
  } finally { URL.revokeObjectURL(url) }
}

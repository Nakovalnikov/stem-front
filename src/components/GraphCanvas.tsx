import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { numeric, readable } from '../domain/analysis'
import type { DataRow, GraphCamera, GraphSettings, Mode, ModelResponse, TrainingRow, Unit } from '../domain/types'

interface Props {
  mode: Mode; onMode: (mode: Mode) => void
  training: TrainingRow[]; data: DataRow[]; result: ModelResponse | null
  settings: GraphSettings; camera: GraphCamera; onCamera: (camera: GraphCamera) => void
  pending: boolean; error: string; unit: Unit
  exportSize?: { width: number; height: number }
}
type XY = [number, number]

function niceStep(span: number) {
  const target = Math.max(1e-9, span / 8)
  const power = 10 ** Math.floor(Math.log10(target))
  const fraction = target / power
  return (fraction > 5 ? 10 : fraction > 2 ? 5 : fraction > 1 ? 2 : 1) * power
}

function axisTicks(min: number, max: number) {
  const step = niceStep(max - min)
  const first = Math.ceil(min / step) * step
  const ticks: number[] = []
  for (let v = first; v <= max + step * 1e-8 && ticks.length < 100; v += step) ticks.push(Number(v.toPrecision(10)))
  return ticks
}

export default function GraphCanvas({ mode, onMode, training, data, result, settings, camera, onCamera, pending, error, unit, exportSize }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ width: 960, height: 620 })
  const renderSize = exportSize ?? size
  const drag = useRef<{
    id: number; x: number; y: number; moved: boolean
    camera: GraphCamera; latest: GraphCamera
  } | null>(null)
  const [cameraPreview, setCameraPreview] = useState<GraphCamera | null>(null)
  const wheelTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(wheelTimer.current), [])

  useEffect(() => {
    const node = hostRef.current
    if (!node || exportSize) return
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setSize({ width: Math.max(300, Math.round(width)), height: Math.max(240, Math.round(height)) })
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [exportSize])

  const plot = useMemo(() => ({ left: 68, top: 24, width: renderSize.width - 94, height: renderSize.height - 88 }), [renderSize.width, renderSize.height])
  const trainPoints = useMemo(() => training.flatMap(row => {
    const x = numeric(row.from), y = numeric(row.to)
    return x === null || y === null ? [] : [[x,y] as XY]
  }), [training])
  const workPoints = useMemo(() => data.flatMap(row => {
    const x = numeric(row.from)
    return x === null ? [] : [[x,x] as XY]
  }), [data])
  const predicted = useMemo(() => {
    const byId = new Map(result?.predictions.map(p => [p.id,p.to]))
    return data.flatMap(row => {
      const x = numeric(row.from), y = byId.get(row.id)
      return x === null || y === undefined ? [] : [[x,y] as XY]
    })
  }, [data,result])
  const basePoints = mode === 'training' ? trainPoints : workPoints
  // Автомасштаб залежить лише від точок, а не від кривих і прямих.
  // Обидва режими використовують спільні межі; експорт має такий самий кадр.
  const pointBounds = useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    const include = (x: number, y: number) => {
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
    for (const [x, y] of trainPoints) {
      include(x, x) // Вхідні точки TRAINING лежать на діагоналі.
      include(x, y) // Еталонні точки TRAINING.
    }
    for (const [x, y] of workPoints) include(x, y)
    for (const [x, y] of predicted) include(x, y)
    return Number.isFinite(minX)
      ? { minX, maxX, minY, maxY }
      : { minX: 0, maxX: 10, minY: 0, maxY: 10 }
  }, [trainPoints, workPoints, predicted])

  const fittedCamera = useMemo(() => {
    // 1:r: р пікселів за одиницю Y на кожен піксель за одиницю X.
    const ratio = settings.aspectRatio > 0 && Number.isFinite(settings.aspectRatio) ? settings.aspectRatio : 1
    if (camera.manual) return { ...camera, scaleY: camera.scaleX * ratio }
    const { minX: loX, maxX: hiX, minY: loY, maxY: hiY } = pointBounds
    const spanX = Math.max(1e-9, hiX - loX), spanY = Math.max(1e-9, hiY - loY)
    const padding = Math.max(0.05, Math.min(camera.padding,0.4))
    const sx = plot.width * (1 - 2 * padding) / spanX
    const sy = plot.height * (1 - 2 * padding) / (spanY * ratio)
    const scaleX = Math.max(1e-12,Math.min(sx,sy))
    return { ...camera, centerX: (hiX+loX)/2, centerY: (hiY+loY)/2,
      scaleX, scaleY: scaleX*ratio }
  }, [camera,pointBounds,plot,settings.aspectRatio])
  const displayCamera = cameraPreview ?? fittedCamera

  const originX = plot.left + plot.width/2, originY = plot.top + plot.height/2
  const toScreen = ([x,y]: XY): XY => [originX + (x-displayCamera.centerX)*displayCamera.scaleX, originY - (y-displayCamera.centerY)*displayCamera.scaleY]
  const viewX = [displayCamera.centerX - plot.width/(2*displayCamera.scaleX), displayCamera.centerX + plot.width/(2*displayCamera.scaleX)]
  const viewY = [displayCamera.centerY - plot.height/(2*displayCamera.scaleY), displayCamera.centerY + plot.height/(2*displayCamera.scaleY)]
  const xTicks = axisTicks(viewX[0],viewX[1]), yTicks = axisTicks(viewY[0],viewY[1])
  const line = (points: XY[]) => points.map((p,i)=> `${i===0?'M':'L'}${toScreen(p)[0].toFixed(2)},${toScreen(p)[1].toFixed(2)}`).join(' ')
  // Один SVG path замість тисяч окремих circle — ті самі точки, менше DOM-вузлів.
  const dots = (points: XY[], radius: number) => points.map(point => {
    const [x, y] = toScreen(point)
    const r = radius
    return `M${(x-r).toFixed(1)},${y.toFixed(1)}a${r},${r} 0 1 0 ${2*r},0a${r},${r} 0 1 0 ${-2*r},0`
  }).join(' ')

  useEffect(() => {
    const svg = svgRef.current
    if (!svg || exportSize) return
    function onWheel(event: WheelEvent) {
      event.preventDefault()
      if (!svg) return
      const box = svg.getBoundingClientRect()
      const px = (event.clientX - box.left) * renderSize.width / box.width
      const py = (event.clientY - box.top) * renderSize.height / box.height
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12
      const nextX = Math.max(0.00001,Math.min(100000,displayCamera.scaleX*factor))
      const nextY = nextX * settings.aspectRatio
      const anchorX = displayCamera.centerX + (px-originX)/displayCamera.scaleX
      const anchorY = displayCamera.centerY - (py-originY)/displayCamera.scaleY
      const next = { ...displayCamera, manual: true, scaleX: nextX, scaleY: nextY,
        centerX: anchorX - (px-originX)/nextX, centerY: anchorY + (py-originY)/nextY }
      setCameraPreview(next)
      window.clearTimeout(wheelTimer.current)
      wheelTimer.current = window.setTimeout(() => {
        onCamera(next)
        setCameraPreview(null)
      }, 120)
    }
    svg.addEventListener('wheel',onWheel,{passive:false})
    return () => svg.removeEventListener('wheel',onWheel)
  },[displayCamera,originX,originY,onCamera,renderSize,exportSize])

  function pointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.pointerType !== 'touch' && event.button !== 0 && event.button !== 1) return
    if (drag.current) return
    event.preventDefault()
    window.clearTimeout(wheelTimer.current)
    drag.current = {
      id: event.pointerId, x: event.clientX, y: event.clientY,
      moved: false, camera: displayCamera, latest: displayCamera,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function pointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!drag.current || drag.current.id !== event.pointerId) return
    if (!drag.current.moved && Math.hypot(event.clientX - drag.current.x, event.clientY - drag.current.y) < 3) return
    drag.current.moved = true
    const box = event.currentTarget.getBoundingClientRect()
    const dx = (event.clientX-drag.current.x)*renderSize.width/box.width
    const dy = (event.clientY-drag.current.y)*renderSize.height/box.height
    const initial = drag.current.camera
    const next = { ...initial,manual:true,centerX:initial.centerX-dx/initial.scaleX,centerY:initial.centerY+dy/initial.scaleY }
    drag.current.latest = next
    setCameraPreview(next)
  }
  function pointerUp(event: PointerEvent<SVGSVGElement>) {
    if (drag.current?.id !== event.pointerId) return
    const { latest, moved } = drag.current
    drag.current = null
    setCameraPreview(null)
    if (moved) onCamera(latest)
  }

  // Відтінки визначені у CSS, а SVG отримує готові значення для експорту PNG.
  const styles = getComputedStyle(document.documentElement)
  const color = (property: string, fallback: string) =>
    styles.getPropertyValue(property).trim() || fallback
  const colors = {
    trainInput: color('--graph-train-input', '#e56d48'),
    reference: color('--graph-reference', '#55c5f5'),
    dataInput: color('--graph-data-input', '#df615d'),
    prediction: color('--graph-prediction', '#2468ec'),
    model: color('--graph-model', '#62ce9a'),
    identity: color('--graph-identity', '#e1a14b'),
    label: color('--graph-label', '#27313d'),
    gridTrain: color('--graph-grid-training', '#b6d0ec'),
    gridData: color('--graph-grid-data', '#f0c2bf'),
    background: color(mode === 'training' ? '--graph-background-training' : '--graph-background-data', mode === 'training' ? '#f8fbff' : '#fff9f8'),
  }
  const labelSize = settings.valueLabels === 'large' ? 15 : 10
  const labeledPoints = mode === 'training' ? trainPoints : predicted
  // Високі щільності точок не повинні створювати тисячі перекривних написів.
  const labelStep = Math.max(1, Math.ceil(labeledPoints.length / 120))
  const visibleLabels = labeledPoints.filter((_, index) => index % labelStep === 0)

  const status = pending
    ? 'Обчислюємо…'
    : error
      ? 'Помилка даних'
      : basePoints.length === 0
        ? 'Недостатньо даних'
        : !result ? 'Очікуємо запуску' : ''
  const clipId = `stem-plot-clip-${exportSize ? 'export-' : ''}${mode}`
  const gridColor = mode === 'training' ? colors.gridTrain : colors.gridData
  const figure = (
    <svg
      id={exportSize ? `workspace-export-${mode}` : 'workspace-plot'}
      ref={svgRef}
      viewBox={`0 0 ${renderSize.width} ${renderSize.height}`}
      width="100%"
      height="100%"
      role="img"
      aria-label="Графік: по горизонталі FROM, по вертикалі TO"
      onPointerDown={exportSize ? undefined : pointerDown}
      onPointerMove={exportSize ? undefined : pointerMove}
      onPointerUp={exportSize ? undefined : pointerUp}
      onPointerCancel={exportSize ? undefined : pointerUp}
      onAuxClick={event => {
        if (event.button === 1) event.preventDefault()
      }}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={plot.left} y={plot.top} width={plot.width} height={plot.height} />
        </clipPath>
      </defs>
      <rect width={renderSize.width} height={renderSize.height} fill="#fff" />
      <rect x={plot.left} y={plot.top} width={plot.width} height={plot.height} fill={colors.background} />

      {settings.showGrid && basePoints.length > 0 && xTicks.map((value, index) => {
        const x = toScreen([value, 0])[0]
        return (
          <line
            key={`grid-x-${index}`}
            x1={x} y1={plot.top} x2={x} y2={plot.top + plot.height}
            stroke={gridColor}
          />
        )
      })}
      {settings.showGrid && basePoints.length > 0 && yTicks.map((value, index) => {
        const y = toScreen([0, value])[1]
        return (
          <line
            key={`grid-y-${index}`}
            x1={plot.left} y1={y} x2={plot.left + plot.width} y2={y}
            stroke={gridColor}
          />
        )
      })}

      <rect
        x={plot.left} y={plot.top} width={plot.width} height={plot.height}
        fill="none" stroke="#cfd3d9"
      />
      {basePoints.length > 0 && xTicks.map((value, index) => (
        <text
          key={`x-${index}`}
          x={toScreen([value, 0])[0]}
          y={plot.top + plot.height + 19}
          textAnchor="middle" fill="#777e86" fontSize="11"
        >
          {readable(value, 1)}
        </text>
      ))}
      {basePoints.length > 0 && yTicks.map((value, index) => (
        <text
          key={`y-${index}`}
          x={plot.left - 12}
          y={toScreen([0, value])[1] + 4}
          textAnchor="end" fill="#777e86" fontSize="11"
        >
          {readable(value, 1)}
        </text>
      ))}
      <text
        x={plot.left + plot.width / 2}
        y={renderSize.height - 10}
        textAnchor="middle" fontSize="13" fill="#5e646b"
      >
        FROM · {unit}
      </text>
      <text
        x="19" y={plot.top + plot.height / 2}
        transform={`rotate(-90 19 ${plot.top + plot.height / 2})`}
        textAnchor="middle" fontSize="13" fill="#5e646b"
      >
        TO · {unit}
      </text>

      <g clipPath={`url(#${clipId})`}>
        {basePoints.length > 0 && settings.lineWidth > 0 && (
          <path
            d={line([[viewX[0], viewX[0]], [viewX[1], viewX[1]]])}
            fill="none" stroke={colors.identity}
            strokeWidth={settings.lineWidth} strokeDasharray="7 5"
          />
        )}
        {result && settings.lineWidth > 0 && result.curve.length > 1 && (
          <path
            d={line(result.curve.map(point => [point.x, point.y]))}
            fill="none" stroke={colors.model}
            strokeDasharray={mode === 'data' ? '10 7' : undefined}
            strokeWidth={settings.lineWidth + 0.3}
            strokeLinecap="round" strokeLinejoin="round"
          />
        )}
        {settings.pointSize > 0 && mode === 'training' && (
          <>
            <path d={dots(trainPoints.map(([x]): XY => [x, x]), settings.pointSize)} fill={colors.trainInput} />
            <path d={dots(trainPoints, settings.pointSize)} fill={colors.reference} />
          </>
        )}
        {settings.pointSize > 0 && mode === 'data' && (
          <>
            <path d={dots(workPoints, settings.pointSize)} fill={colors.dataInput} />
            <path d={dots(predicted, settings.pointSize)} fill={colors.prediction} />
          </>
        )}
        {settings.valueLabels !== 'off' && visibleLabels.map(([x, y], index) => {
          const [cx, cy] = toScreen([x, y])
          return (
            <text
              key={`value-label-${index}`}
              x={cx}
              y={cy - Math.max(8, settings.pointSize + 4)}
              textAnchor="middle"
              fontSize={labelSize}
              fontWeight="500"
              fill={colors.label}
              stroke="white"
              strokeWidth="3"
              paintOrder="stroke"
            >
              {readable(y)}
            </text>
          )
        })}
      </g>
      {status && (
        <g>
          <rect
            x={renderSize.width / 2 - 150} y={renderSize.height / 2 - 27}
            width="300" height="54" rx="6" fill="#fff" opacity=".91"
          />
          <text
            x={renderSize.width / 2} y={renderSize.height / 2 + 5}
            textAnchor="middle" fill={error ? '#b54e4e' : '#9ca1aa'}
            fontSize="19" fontWeight="600"
          >
            {status}
          </text>
        </g>
      )}
    </svg>
  )

  if (exportSize) return <div className="export-figure">{figure}</div>

  return (
    <main className={`graph-area mode-${mode}`}>
      <div className="graph-toolbar">
        <div className="graph-tabs">
          <button className={mode === 'training' ? 'chosen' : ''} onClick={() => onMode('training')}>
            TRAINING
          </button>
          <button className={mode === 'data' ? 'chosen' : ''} onClick={() => onMode('data')}>
            DATA
          </button>
        </div>
        <div className="graph-toolbar-right">
          <span className="inline-hint">Масштаб 1:{settings.aspectRatio}</span>
          <button
            className="tiny-icon-button"
            title="Автомасштаб"
            onClick={() => {
              window.clearTimeout(wheelTimer.current)
              setCameraPreview(null)
              onCamera({ ...camera, manual: false, padding: 0.1 })
            }}
          >
            ⤢
          </button>
        </div>
      </div>
      <div className="graph-host" ref={hostRef}>{figure}</div>
      <div className="graph-foot">
        <div className="legend-items">
          <span><i className="legend-dot orange" /> Вхідні (навчальні)</span>
          <span><i className="legend-dot teal" /> Еталонні (навчальні)</span>
          <span><i className="legend-dot green" /> Крива корекції</span>
          <span><i className="legend-dot red" /> Вхідні (робочі)</span>
          <span><i className="legend-dot blue" /> Скориговані (робочі)</span>
        </div>
        <span className="inline-hint">Коліщатко — масштаб · Перетягування — переміщення</span>
      </div>
    </main>
  )
}

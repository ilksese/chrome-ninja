import qrcode from "qrcode-generator"
import { useEffect, useRef, useState } from "preact/hooks"

type QrPanelProps = {
  initialText?: string
}

const QR_CANVAS_PIXELS = 464
const QR_QUIET_MODULES = 4
const QR_DEBOUNCE_MS = 150

function toUtf8BytesString(text: string) {
  const bytes = new TextEncoder().encode(text)
  let output = ""
  for (let i = 0; i < bytes.length; i += 0x8000) {
    output += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return output
}

function drawQrToCanvas(canvas: HTMLCanvasElement, text: string) {
  const qr = qrcode(0, "M")
  qr.addData(toUtf8BytesString(text))
  qr.make()

  const count = qr.getModuleCount()
  canvas.width = QR_CANVAS_PIXELS
  canvas.height = QR_CANVAS_PIXELS

  const ctx = canvas.getContext("2d")
  if (!ctx) return

  const cellSize = Math.floor(QR_CANVAS_PIXELS / (count + QR_QUIET_MODULES * 2))
  const offset = Math.floor((QR_CANVAS_PIXELS - cellSize * count) / 2)

  ctx.save()
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, QR_CANVAS_PIXELS, QR_CANVAS_PIXELS)
  ctx.translate(offset, offset)
  qr.renderTo2dContext(ctx, cellSize)
  ctx.restore()
}

function clearCanvas(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
}

function QrPanel({ initialText = "" }: QrPanelProps) {
  const [text, setText] = useState(initialText)
  const [pendingText, setPendingText] = useState(initialText)
  const [qrError, setQrError] = useState("")
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const composingRef = useRef(false)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => setPendingText(text), QR_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [text])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !pendingText.trim()) {
      setQrError("")
      return
    }
    try {
      drawQrToCanvas(canvas, pendingText.trim())
      setQrError("")
    } catch {
      clearCanvas(canvas)
      setQrError("文本过长，超出二维码容量")
    }
  }, [pendingText])

  const hasText = pendingText.trim().length > 0

  return (
    <div className="space-y-3 p-4">
      {hasText ? (
        <div className="grid place-items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 py-4">
          <canvas ref={canvasRef} className="h-[232px] w-[232px] rounded-md" height={QR_CANVAS_PIXELS} width={QR_CANVAS_PIXELS} />
          {qrError && <p className="text-xs text-red-600">{qrError}</p>}
        </div>
      ) : (
        <div className="grid h-[264px] place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6">
          <p className="text-center text-xs text-slate-400">输入文本后自动生成二维码</p>
        </div>
      )}
      <textarea
        ref={textareaRef}
        className="h-24 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-5 text-slate-800"
        placeholder="输入文本，默认是当前网页地址"
        value={text}
        onInput={(event) => {
          if (composingRef.current) return
          setText(event.currentTarget.value)
        }}
        onCompositionStart={() => {
          composingRef.current = true
        }}
        onCompositionEnd={(event) => {
          composingRef.current = false
          setText(event.currentTarget.value)
        }}
      />
    </div>
  )
}

export default QrPanel

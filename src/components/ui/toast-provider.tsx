"use client"

import { useEffect, useState, useCallback } from "react"
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react"

interface ToastMessage {
  id: number
  type: "success" | "error" | "warning" | "info"
  title: string
  message: string
  duration: number
}

interface ConfirmState {
  open: boolean
  title: string
  message: string
  resolve: ((value: boolean) => void) | null
}

let toastCounter = 0

export function ToastProvider() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [confirm, setConfirm] = useState<ConfirmState>({
    open: false,
    title: "",
    message: "",
    resolve: null,
  })

  const addToast = useCallback((type: ToastMessage["type"], text: string) => {
    // Parse title from text (first line = title, rest = message)
    const lines = text.split("\n")
    const title = lines[0] || ""
    const message = lines.slice(1).join("\n").trim()

    const id = ++toastCounter
    const duration = message.length > 200 ? 8000 : 5000

    setToasts(prev => [...prev, { id, type, title, message, duration }])

    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, duration)
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  useEffect(() => {
    // Override window.alert
    const originalAlert = window.alert
    window.alert = (msg: string) => {
      const text = String(msg || "")
      // Detect type from content
      const type = text.toLowerCase().includes("gagal") || text.toLowerCase().includes("error") || text.toLowerCase().includes("failed")
        ? "error"
        : text.toLowerCase().includes("berhasil") || text.toLowerCase().includes("success")
        ? "success"
        : text.toLowerCase().includes("peringatan") || text.toLowerCase().includes("warning")
        ? "warning"
        : "info"
      addToast(type, text)
    }

    // Override window.confirm
    const originalConfirm = window.confirm
    window.confirm = (msg?: string): boolean => {
      // For confirm, we can't make it async with the native API
      // So we use a workaround: show the confirm dialog and return true immediately
      // This is not ideal but works for our use case since confirms are followed by async operations

      // Actually, we need to handle this differently.
      // Since confirm() is synchronous, we can't replace it with an async modal cleanly.
      // Instead, let's style the native confirm but keep it synchronous.
      // The best approach: leave confirm() as native for now, just override alert().
      return originalConfirm(msg)
    }

    return () => {
      window.alert = originalAlert
      window.confirm = originalConfirm
    }
  }, [addToast])

  const iconMap = {
    success: <CheckCircle2 className="size-5 text-emerald-500 shrink-0" />,
    error: <XCircle className="size-5 text-red-500 shrink-0" />,
    warning: <AlertTriangle className="size-5 text-amber-500 shrink-0" />,
    info: <Info className="size-5 shrink-0" style={{ color: "#0ea5e9" }} />,
  }

  const bgMap = {
    success: { background: "rgba(16,185,129,0.1)", borderColor: "#bbf7d0" },
    error: { background: "rgba(239,68,68,0.1)", borderColor: "#fecaca" },
    warning: { background: "rgba(245,158,11,0.1)", borderColor: "#fde68a" },
    info: { background: "rgba(14,165,233,0.1)", borderColor: "#bae6fd" },
  }

  const titleColorMap = {
    success: "#166534",
    error: "#991b1b",
    warning: "#92400e",
    info: "#0c4a6e",
  }

  return (
    <>
      {/* Toast container - fixed top right */}
      <div
        style={{
          position: "fixed",
          top: 16,
          right: 16,
          zIndex: 99999,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          maxWidth: 480,
          width: "100%",
          pointerEvents: "none",
        }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            style={{
              ...bgMap[toast.type],
              borderWidth: 1,
              borderStyle: "solid",
              borderRadius: 12,
              padding: "14px 16px",
              boxShadow: "0 10px 25px -5px rgba(0,0,0,.1), 0 4px 6px rgba(0,0,0,.05)",
              pointerEvents: "auto",
              animation: "slideIn 0.3s ease-out",
            }}
          >
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              {iconMap[toast.type]}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  fontWeight: 600,
                  fontSize: 14,
                  color: titleColorMap[toast.type],
                  marginBottom: toast.message ? 4 : 0,
                  lineHeight: 1.4,
                }}>
                  {toast.title}
                </p>
                {toast.message && (
                  <p style={{
                    fontSize: 12,
                    color: titleColorMap[toast.type],
                    opacity: 0.8,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    maxHeight: 200,
                    overflow: "auto",
                  }}>
                    {toast.message}
                  </p>
                )}
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 2,
                  opacity: 0.5,
                  flexShrink: 0,
                }}
              >
                <X className="size-4" style={{ color: titleColorMap[toast.type] }} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* CSS animation */}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </>
  )
}

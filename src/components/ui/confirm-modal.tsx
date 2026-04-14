"use client"

import { useState, useCallback, createContext, useContext } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { AlertTriangle, HelpCircle, Loader2 } from "lucide-react"

interface ConfirmOptions {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: "default" | "danger"
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmContextType | null>(null)

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider")
  return ctx.confirm
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const [resolver, setResolver] = useState<((value: boolean) => void) | null>(null)

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setOptions(opts)
      setResolver(() => resolve)
      setOpen(true)
    })
  }, [])

  function handleConfirm() {
    setOpen(false)
    resolver?.(true)
    setResolver(null)
  }

  function handleCancel() {
    setOpen(false)
    resolver?.(false)
    setResolver(null)
  }

  const isDanger = options?.variant === "danger"

  return (
    <ConfirmContext value={{ confirm }}>
      {children}
      <Dialog open={open} onOpenChange={(v) => { if (!v) handleCancel() }}>
        <DialogContent className="rounded-xl border sm:max-w-[440px]" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div
                className="flex items-center justify-center size-10 rounded-xl shrink-0 mt-0.5"
                style={{
                  background: isDanger ? "rgba(239,68,68,0.1)" : "rgba(14,165,233,0.1)",
                }}
              >
                {isDanger ? (
                  <AlertTriangle className="size-5" style={{ color: "#ef4444" }} />
                ) : (
                  <HelpCircle className="size-5" style={{ color: "#0ea5e9" }} />
                )}
              </div>
              <div>
                <DialogTitle style={{ color: "var(--foreground)" }}>
                  {options?.title || "Konfirmasi"}
                </DialogTitle>
                <DialogDescription className="mt-1.5 whitespace-pre-line" style={{ color: "var(--muted-foreground)" }}>
                  {options?.message}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <DialogFooter className="mt-2 gap-2 sm:gap-2">
            <Button
              variant="outline"
              className="rounded-lg"
              style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
              onClick={handleCancel}
            >
              {options?.cancelText || "Batal"}
            </Button>
            <Button
              className="rounded-lg shadow-lg"
              style={{
                background: isDanger ? "#ef4444" : "#0ea5e9",
                color: "#ffffff",
                boxShadow: isDanger
                  ? "0 4px 14px rgba(239,68,68,0.3)"
                  : "0 4px 14px rgba(14,165,233,0.3)",
              }}
              onClick={handleConfirm}
            >
              {options?.confirmText || "Ya, Lanjutkan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext>
  )
}

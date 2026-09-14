"use client"

import * as React from "react"
import { Toast as ToastPrimitive, type ToastManagerAddOptions } from "@base-ui/react/toast"
import { cn } from "@/lib/utils"
import { Check } from "lucide-react"

/** Small filled dot with a white check — matches the app's todo circles. */
function SuccessIcon() {
  return (
    <span
      className="grid size-4 shrink-0 place-items-center rounded-full bg-foreground leading-none"
      aria-hidden
    >
      <Check className="size-2.5 text-background" strokeWidth={3} />
    </span>
  )
}

function ToastIcon({ type }: { type: string | undefined }) {
  let icon: React.ReactNode = null

  if (type === "success") {
    icon = <SuccessIcon />
  }

  if (!icon) {
    return null
  }

  return (
    <span
      data-slot="toast-icon"
      className="flex shrink-0 items-center self-center [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4"
    >
      {icon}
    </span>
  )
}

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager()

  return toasts.map((toastItem) => (
    <Toast key={toastItem.id} toast={toastItem}>
      <ToastContent>
        <ToastIcon type={toastItem.type} />
        <ToastTitle />
      </ToastContent>
    </Toast>
  ))
}

const createToastManager = ToastPrimitive.createToastManager
const useToastManager = ToastPrimitive.useToastManager

function Toast({ className, ...props }: ToastPrimitive.Root.Props) {
  return (
    <ToastPrimitive.Root
      data-slot="toast"
      // Portal content: toasts are swipeable, never window-draggable.
      data-tauri-drag-region="false"
      className={cn(
        "group/toast pointer-events-auto absolute right-0 bottom-0 left-0 z-[calc(1000-var(--toast-index))] mx-auto w-fit origin-bottom rounded-3xl border border-border/60 bg-popover/60 text-popover-foreground shadow-lg backdrop-blur-2xl will-change-transform outline-none select-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "[--gap:0.75rem] [--height:var(--toast-frontmost-height,var(--toast-height))] [--offset-y:calc(var(--toast-offset-y)*-1+calc(var(--toast-index)*var(--gap)*-1)+var(--toast-swipe-movement-y))] [--peek:0.75rem] [--scale:calc(max(0,1-(var(--toast-index)*0.1)))] [--shrink:calc(1-var(--scale))]",
        "h-(--height) [transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--peek))-(var(--shrink)*var(--height))))_scale(var(--scale))] [transition:transform_500ms_cubic-bezier(0.22,1,0.36,1),opacity_500ms,height_150ms]",
        "after:absolute after:top-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']",
        "data-expanded:h-(--toast-height) data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]",
        "data-limited:opacity-0 data-starting-style:[transform:translateY(150%)] data-ending-style:opacity-0",
        "[&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(150%)]",
        "data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]",
        "data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]",
        "data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
        "data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]",
        "data-expanded:data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]",
        "data-expanded:data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]",
        "data-expanded:data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
        "data-expanded:data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]",
        className
      )}
      {...props}
    />
  )
}

function ToastContent({ className, ...props }: ToastPrimitive.Content.Props) {
  return (
    <ToastPrimitive.Content
      data-slot="toast-content"
      className={cn(
        "flex h-full items-center gap-2.5 overflow-hidden px-4 py-2.5 transition-opacity duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] data-behind:opacity-0 data-expanded:opacity-100",
        className
      )}
      {...props}
    />
  )
}

function ToastTitle({ className, ...props }: ToastPrimitive.Title.Props) {
  return (
    <ToastPrimitive.Title
      data-slot="toast-title"
      className={cn("flex w-fit items-center text-[13px] font-medium leading-5 whitespace-nowrap", className)}
      {...props}
    />
  )
}

/** Centered above the capture bar, toasts shrink-wrap their title. */
function ToastViewport({ className, ...props }: ToastPrimitive.Viewport.Props) {
  return (
    <ToastPrimitive.Viewport
      data-slot="toast-viewport"
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-[110px] z-50 flex justify-center outline-none",
        className
      )}
      {...props}
    />
  )
}

const toast = ToastPrimitive.createToastManager()

// Base UI pauses toast timers while the window is unfocused (and WebView2
// throttles page timers for background windows), so an in-app toast could
// linger forever until the window was focused again. Track expiry deadlines
// here and close them from a dedicated worker whose timers keep running
// regardless of focus.
const TOAST_TIMEOUT_MS = 5000
const expirations = new Map<string, number>()
let expiryWorker: Worker | null = null

function ensureExpiryWorker(): Worker | null {
  if (expiryWorker) return expiryWorker
  try {
    expiryWorker = new Worker(
      new URL("../../lib/toast-expiry-worker.ts", import.meta.url),
      { type: "module" }
    )
    expiryWorker.onmessage = () => {
      const now = Date.now()
      for (const [id, deadline] of expirations) {
        if (now >= deadline) {
          expirations.delete(id)
          toast.close(id)
        }
      }
    }
  } catch {
    // Worker unavailable (e.g. blocked by the environment); Base UI's own
    // timers still close toasts whenever the window is focused.
  }
  return expiryWorker
}

/** App-scoped add(): same manager, plus focus-independent expiry. */
function addToast(options: ToastManagerAddOptions<any>) {
  const id = toast.add({ ...options, timeout: TOAST_TIMEOUT_MS })
  ensureExpiryWorker()
  expirations.set(id, Date.now() + TOAST_TIMEOUT_MS)
  return id
}

const toastWithExpiry = {
  add: addToast,
  close: (id?: string) => {
    if (id) expirations.delete(id)
    else expirations.clear()
    return toast.close(id)
  },
  promise: toast.promise.bind(toast),
  update: toast.update.bind(toast),
}

function ToastProvider({ ...props }: ToastPrimitive.Provider.Props) {
  return <ToastPrimitive.Provider {...props} />
}

function ToastPortal({ ...props }: ToastPrimitive.Portal.Props) {
  return <ToastPrimitive.Portal data-slot="toast-portal" {...props} />
}

function Toaster({
  children,
  toastManager = toast,
  ...props
}: ToastPrimitive.Provider.Props) {
  return (
    <ToastProvider toastManager={toastManager} {...props}>
      {children}
      <ToastPortal>
        <ToastViewport>
          <ToastList />
        </ToastViewport>
      </ToastPortal>
    </ToastProvider>
  )
}

export {
  Toaster,
  Toast,
  ToastContent,
  ToastPortal,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  createToastManager,
  toastWithExpiry as toast,
  useToastManager,
}

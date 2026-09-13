// Vendored from Tauri's built-in drag-region script
// (tauri/src/window/scripts/drag.js in the Tauri repository).
//
// Tauri (>= 2.x, e.g. 2.11.5) ALSO injects its own copy of this script into
// every webview via the window plugin's init script. That stock copy runs
// before any page script and calls stopImmediatePropagation(), so it would
// swallow this module entirely — reintroducing the bugs fixed here (inputs
// never blurring, scrollbar grabs dragging the window). To win the race this
// module registers its mousedown listener in the CAPTURE phase: it always runs
// first, handles the drag itself, and blocks the stock copy when needed.
//
// Original license headers preserved:
//
// Copyright 2019-2024 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT

declare global {
  interface Window {
    __TAURI_INTERNALS__: {
      invoke(cmd: string, args?: unknown): Promise<unknown>;
    };
  }
}

;(function () {
  //-----------------------//
  // drag on mousedown and maximize on double click on Windows and Linux
  // while macOS maximization should be on mouseup and if the mouse
  // moves after the double click, it should be cancelled (see https://github.com/tauri-apps/tauri/issues/8306)
  //-----------------------//
  const TAURI_DRAG_REGION_ATTR = 'data-tauri-drag-region'
  const CLICKABLE_TAGS = new Set([
    'A',
    'BUTTON',
    'INPUT',
    'SELECT',
    'TEXTAREA',
    'LABEL',
    'SUMMARY'
  ])
  const INTERACTIVE_ROLES = new Set([
    'button',
    'link',
    'menuitem',
    'tab',
    'checkbox',
    'radio',
    'switch',
    'option'
  ])

  function isClickableElement(el: HTMLElement): boolean {
    return (
      CLICKABLE_TAGS.has(el.tagName) ||
      (el.hasAttribute('contenteditable') &&
        el.getAttribute('contenteditable') !== 'false') ||
      (el.hasAttribute('tabindex') && el.getAttribute('tabindex') !== '-1') ||
      INTERACTIVE_ROLES.has(el.getAttribute('role') || '')
    )
  }

  // Walk the composed path from target upward.
  //
  // Supported values for data-tauri-drag-region:
  //   (bare / no value / "true") -> self: only direct clicks on this element trigger drag
  //   "deep"                   -> deep: clicks anywhere in the subtree trigger drag
  //   "false"                  -> disabled: drag is blocked here (and for ancestors)
  //
  // Clickable elements (buttons, links, etc.) normally block dragging,
  // but if they themselves carry data-tauri-drag-region they act as drag regions.
  function isDragRegion(composedPath: EventTarget[]): boolean {
    for (const target of composedPath) {
      if (!(target instanceof HTMLElement)) continue
      const el = target as HTMLElement

      const attr = el.getAttribute(TAURI_DRAG_REGION_ATTR)

      // clickable without explicit drag region → blocks drag
      if (isClickableElement(el) && attr === null) return false
      // no attr → keep walking up
      if (attr === null) continue
      // explicitly disabled
      if (attr === 'false') return false
      // subtree drag — any descendant triggers
      if (attr === 'deep') return true
      // bare or "true" attr — only direct clicks on this element
      if (attr === '' || attr === 'true') return el === composedPath[0]
    }

    return false
  }

  // Native scrollbars are not elements: a mousedown on a scrollbar thumb or
  // track targets the scroll container itself (a plain div), so without this
  // check grabbing the thumb would start a window drag instead of scrolling.
  function isOnScrollbar(e: MouseEvent, composedPath: EventTarget[]): boolean {
    for (const target of composedPath) {
      if (!(target instanceof HTMLElement)) continue
      const el = target
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) continue
      // clientWidth/clientHeight exclude the scrollbar, so any leftover
      // width/height on a scrollable element is (at least) the scrollbar.
      const vBar = rect.width - el.clientWidth
      if (vBar > 0 && el.scrollHeight > el.clientHeight) {
        if (e.clientX >= rect.right - vBar) return true
        // In RTL the vertical scrollbar sits on the left edge.
        if (getComputedStyle(el).direction === 'rtl' && e.clientX <= rect.left + vBar) {
          return true
        }
      }
      const hBar = rect.height - el.clientHeight
      if (hBar > 0 && el.scrollWidth > el.clientWidth && e.clientY >= rect.bottom - hBar) {
        return true
      }
    }
    return false
  }

  // Upstream fills this in at build time; detect at runtime instead.
  const osName: string = /mac/i.test(navigator.userAgent) ? 'macos' : 'windows'

  // initial mousedown position for macOS
  let initialX = 0
  let initialY = 0

  // Capture phase: must run BEFORE Tauri's stock drag script (a document-level
  // bubble listener injected as an init script). We stopImmediatePropagation()
  // whenever the stock copy must not act — it has no blur handling and no
  // scrollbar guard, so letting it run reintroduces both bugs.
  document.addEventListener(
    'mousedown',
    (e) => {
      const path = e.composedPath()
      // Native scrollbar interaction: block the stock drag script and let the
      // browser scroll natively.
      if (isOnScrollbar(e, path)) {
        e.stopImmediatePropagation()
        return
      }
      if (
        // was left mouse button
        e.button === 0 &&
        // and was normal click to drag or double click to maximize
        (e.detail === 1 || e.detail === 2) &&
        // and is drag region
        isDragRegion(path)
      ) {
        // macOS maximization happens on `mouseup`,
        // so we save needed state and early return
        if (osName === 'macos' && e.detail === 2) {
          initialX = e.clientX
          initialY = e.clientY
          return
        }

        // Clicking window chrome must release focus explicitly: the
        // preventDefault() below freezes focus in place, so without this an
        // input keeps its caret (and focus ring) when clicking elsewhere.
        // Mousedowns on fields never reach here — fields block dragging.
        const active = document.activeElement
        if (active instanceof HTMLElement && active !== e.target) active.blur()

        // prevents text cursor
        e.preventDefault()

        // fix #2549: double click on drag region edge causes content to maximize without window sizing change
        // https://github.com/tauri-apps/tauri/issues/2549#issuecomment-1250036908
        // Also blocks Tauri's stock drag script from handling the same event.
        e.stopImmediatePropagation()

        // start dragging if the element has a `tauri-drag-region` data attribute and maximize on double-clicking it
        const cmd = e.detail === 2 ? 'internal_toggle_maximize' : 'start_dragging'
        void window.__TAURI_INTERNALS__.invoke('plugin:window|' + cmd)
      }
    },
    true
  )

  // on macOS we maximize on mouseup instead, to match the system behavior where maximization can be canceled
  // if the mouse moves outside the data-tauri-drag-region
  if (osName === 'macos') {
    document.addEventListener('mouseup', (e) => {
      if (
        // was left mouse button
        e.button === 0 &&
        // and was double click
        e.detail === 2 &&
        // and the cursor hasn't moved from initial mousedown
        e.clientX === initialX &&
        e.clientY === initialY &&
        // and not on a scrollbar
        !isOnScrollbar(e, e.composedPath()) &&
        // and the event path contains a drag region (with no clickable element in between)
        isDragRegion(e.composedPath())
      ) {
        void window.__TAURI_INTERNALS__.invoke(
          'plugin:window|internal_toggle_maximize'
        )
      }
    })
  }
})()

export {}

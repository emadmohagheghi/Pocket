// Vendored from Tauri's built-in drag-region script
// (tauri/src/window/scripts/drag.js in the Tauri repository).
//
// Tauri ships this file but, as of the version this app builds against, never
// wires it into webviews — `data-tauri-drag-region` attributes are inert
// without it, which is why our frameless window could not be dragged.
// Importing this module (side effect) installs the stock behavior:
// mousedown inside a drag region invokes `plugin:window|start_dragging`.
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

  // Upstream fills this in at build time; detect at runtime instead.
  const osName: string = /mac/i.test(navigator.userAgent) ? 'macos' : 'windows'

  // initial mousedown position for macOS
  let initialX = 0
  let initialY = 0

  document.addEventListener('mousedown', (e) => {
    if (
      // was left mouse button
      e.button === 0 &&
      // and was normal click to drag or double click to maximize
      (e.detail === 1 || e.detail === 2) &&
      // and is drag region
      isDragRegion(e.composedPath())
    ) {
      // macOS maximization happens on `mouseup`,
      // so we save needed state and early return
      if (osName === 'macos' && e.detail === 2) {
        initialX = e.clientX
        initialY = e.clientY
        return
      }

      // prevents text cursor
      e.preventDefault()

      // fix #2549: double click on drag region edge causes content to maximize without window sizing change
      // https://github.com/tauri-apps/tauri/issues/2549#issuecomment-1250036908
      e.stopImmediatePropagation()

      // start dragging if the element has a `tauri-drag-region` data attribute and maximize on double-clicking it
      const cmd = e.detail === 2 ? 'internal_toggle_maximize' : 'start_dragging'
      void window.__TAURI_INTERNALS__.invoke('plugin:window|' + cmd)
    }
  })

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

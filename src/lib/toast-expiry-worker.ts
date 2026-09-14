/**
 * Dedicated worker that ticks even while the window is unfocused or hidden.
 * WebView2 pauses/throttles page timers for background windows, which froze
 * Base UI's own toast countdown (it also pauses on window blur by design);
 * dedicated-worker timers keep running, so the main thread can expire toasts
 * on schedule regardless of focus.
 */
setInterval(() => {
  self.postMessage("tick");
}, 250);

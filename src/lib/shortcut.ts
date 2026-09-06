import type { MouseEvent, KeyboardEvent } from "react";

/**
 * Builds a Tauri/global-hotkey accelerator string from a keyboard event,
 * e.g. "Ctrl+Shift+KeyP". Returns null when the event carries no usable key.
 */
export function acceleratorFromEvent(
  e: KeyboardEvent<HTMLInputElement> | KeyboardEvent<HTMLDivElement> | MouseEvent
): string | null {
  const ke = e as unknown as KeyboardEvent;
  const code = ke.code;
  if (!code) return null;
  // Ignore pure modifier presses — a shortcut needs a real key.
  if (
    code === "ControlLeft" ||
    code === "ControlRight" ||
    code === "ShiftLeft" ||
    code === "ShiftRight" ||
    code === "AltLeft" ||
    code === "AltRight" ||
    code === "MetaLeft" ||
    code === "MetaRight"
  ) {
    return null;
  }
  const parts: string[] = [];
  if (ke.ctrlKey) parts.push("Ctrl");
  if (ke.shiftKey) parts.push("Shift");
  if (ke.altKey) parts.push("Alt");
  if (ke.metaKey) parts.push("Super");
  parts.push(code);
  return parts.join("+");
}

/** Human label for an accelerator or special shortcut string. */
export function shortcutLabel(shortcut: string | null | undefined): string {
  if (!shortcut) return "Unassigned";
  if (shortcut === "DoubleShift") return "Double Shift";
  return shortcut
    .split("+")
    .map((p) => {
      if (p === "Key" || p.startsWith("Key")) return p.slice(3);
      if (p.startsWith("Digit")) return p.slice(5);
      if (p === "Super") return "Win";
      if (p === "Control") return "Ctrl";
      if (p === "Minus") return "-";
      if (p === "Equal") return "=";
      if (p === "Comma") return ",";
      if (p === "Period") return ".";
      if (p === "Slash") return "/";
      if (p === "Backquote") return "`";
      if (p === "Semicolon") return ";";
      if (p === "Quote") return "'";
      if (p === "BracketLeft") return "[";
      if (p === "BracketRight") return "]";
      if (p === "Backslash") return "\\";
      if (p === "Space") return "Space";
      return p;
    })
    .join(" + ");
}

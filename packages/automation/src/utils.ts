// Utility helpers — ported verbatim from automation/scout.js L101-127.

import type { Logger, LogLevel } from "./types.js";

export function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

export function cssEscape(str: string): string {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(str);
  return str.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
}

export function makeLogger(
  onLog?: (level: LogLevel, msg: string) => void,
): Logger {
  const emit = (level: LogLevel, ...parts: unknown[]) => {
    const msg = parts
      .map((p) => (typeof p === "string" ? p : (() => { try { return JSON.stringify(p); } catch { return String(p); } })()))
      .join(" ");
    if (onLog) onLog(level, msg);
    else (level === "error" ? console.error : console.log)(msg);
  };
  return {
    info: (...a) => emit("info", ...a),
    warn: (...a) => emit("warn", ...a),
    error: (...a) => emit("error", ...a),
  };
}

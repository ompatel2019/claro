"use client";

// Retained until the student home ask-card is removed.
const ASK_EVENT = "claro:ask";
export function askClaro(text?: string) {
  window.dispatchEvent(new CustomEvent(ASK_EVENT, { detail: { text } }));
}

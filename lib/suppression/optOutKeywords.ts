// Pure keyword matching — no DB/env access, unit testable directly.
//
// Deliberately NOT a "does this message look like an opt-out" heuristic:
// only an exact match (after trimming/case-folding/punctuation-stripping)
// against this configured list counts. An inbound "STOP the bus is late"
// or a question containing the word "cancel" must NOT be treated as an
// opt-out — see the project brief's explicit warning against assuming
// every inbound message means opt-out.

export const OPT_OUT_KEYWORDS = ["STOP", "UNSUBSCRIBE", "OPT OUT", "OPTOUT", "REMOVE", "CANCEL"];

function normalise(text: string): string {
  return text
    .trim()
    .toUpperCase()
    .replace(/[.,!?;:]+$/g, "")
    .trim();
}

export function isOptOutKeyword(messageText: string | null | undefined): boolean {
  if (!messageText) return false;
  const normalised = normalise(messageText);
  return OPT_OUT_KEYWORDS.includes(normalised);
}

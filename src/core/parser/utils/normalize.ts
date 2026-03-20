/**
 * Normalizes Chinese text by converting full-width punctuation to half-width
 * and normalizing spaces.
 * 
 * @param text The text to normalize
 * @returns The normalized text
 */
export function normalizeChineseText(text: string): string {
  if (!text) return "";

  const charMap: Record<string, string> = {
    "：": ":",
    "（": "(",
    "）": ")",
    "，": ",",
    "。": ".",
    "！": "!",
    "？": "?",
    "；": ";",
    "“": "\"",
    "”": "\"",
    "‘": "'",
    "’": "'",
    "【": "[",
    "】": "]",
    "　": " ", // Full-width space
  };

  let normalized = text;
  for (const [full, half] of Object.entries(charMap)) {
    normalized = normalized.split(full).join(half);
  }

  // Normalize spaces: replace multiple spaces with a single space and trim
  return normalized.replace(/\s+/g, " ").trim();
}

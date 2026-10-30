// Compare stored formulas without changing operators, string literals or sheet names.
export function canonicalFormula(formula) {
  return String(formula ?? '').trim().replace(/^=/, '')
    .split(/("(?:[^"]|"")*"|'(?:[^']|'')*')/g)
    .map((part, index) => index % 2 ? part : part
      .toUpperCase()
      .replace(/(?<![A-Z0-9_.])\$?([A-Z]{1,3})\$?([1-9]\d*)\b/g, '$1$2')
      .replace(/\s+/g, ' ')
      .replace(/\s*([(),:!+*/^&%=<>;\-])\s*/g, '$1'))
    .join('').trim();
}

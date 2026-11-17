export function formatCount(n: number) {
  const abs = Math.abs(n)
  if (abs >= 100_000_000) return trim(n / 100_000_000) + "亿"
  if (abs >= 10_000) return trim(n / 10_000) + "万"
  return String(Math.round(n))
}

function trim(n: number) {
  const text = n.toFixed(1)
  return text.endsWith(".0") ? text.slice(0, -2) : text
}

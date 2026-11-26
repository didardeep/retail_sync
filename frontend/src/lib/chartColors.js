// The app's colours for charts, in one place so every chart matches the rest of
// the app (the tiles, badges and score bars use the same green, amber and red).
// The series order is checked for colour-blind separation; categories take the
// colours in this order, never cycled past the end (extra ones are grey).

export const COLORS = {
  blue: '#0080DB',     // --blue
  green: '#0e9f6e',    // --green, good scores and completed work
  amber: '#f59e0b',    // in progress, scores needing attention
  red: '#e02424',      // --red, low scores and critical risk
  violet: '#8b5cf6',
  cyan: '#06b6d4',
  gray: '#9ca3af',     // cancelled, unrated, "other"
}

export const SERIES = [COLORS.blue, COLORS.amber, COLORS.green, COLORS.violet, COLORS.cyan, COLORS.red]
export const seriesColor = (i) => (i >= 0 && i < SERIES.length ? SERIES[i] : COLORS.gray)

// Audit stages, the same colours as the Planned / Ongoing / Completed tiles.
export const STAGE_COLORS = {
  scheduled: COLORS.blue,
  in_progress: COLORS.amber,
  done: COLORS.green,
  cancelled: COLORS.gray,
}

// Store scores: green at or above the target, amber below it, red when low.
export const SCORE_TARGET = 77
export const scoreColor = (v) => (v >= SCORE_TARGET ? COLORS.green : v >= 60 ? COLORS.amber : COLORS.red)

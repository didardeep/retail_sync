// Small helpers shared by the SOP dashboard charts.
import { bandFor } from './logic';

export const BAND_COLOR = {
  good: '#0e9f6e',
  warn: '#f59e0b',
  bad: '#e02424',
  none: '#9ca3af',
};
export const BRAND = '#00338D';

// Colour a bar by score band; when something is selected, fade the rest.
export function bandColors(percents, selectedIndex) {
  return percents.map((p, i) => {
    const base = BAND_COLOR[bandFor(p)];
    return selectedIndex == null || selectedIndex === i ? base : `${base}55`;
  });
}

export function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

// Options for a clickable bar chart. `onPick(index)` fires when a bar is clicked.
export function clickableBar({ horizontal, onPick, percentAxis }) {
  const valueAxis = percentAxis
    ? { min: 0, max: 100, ticks: { font: { size: 10 }, callback: (v) => `${v}%` } }
    : { beginAtZero: true, ticks: { font: { size: 10 } } };
  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: horizontal ? 'y' : 'x',
    plugins: { legend: { display: false } },
    scales: {
      [horizontal ? 'x' : 'y']: valueAxis,
      [horizontal ? 'y' : 'x']: { ticks: { font: { size: 10 } }, grid: { display: false } },
    },
    onClick: (_event, elements) => {
      if (elements.length) onPick(elements[0].index);
    },
    onHover: (event, elements) => {
      const el = event.native?.target;
      if (el) el.style.cursor = elements.length ? 'pointer' : 'default';
    },
  };
}

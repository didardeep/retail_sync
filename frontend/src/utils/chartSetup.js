import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Tooltip, Legend, Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Tooltip, Legend, Filler
);

// One plain look for every chart, so they read clearly: readable text, quiet
// grid lines, value axes that start at zero, thin bars with rounded ends, and
// a simple tooltip. Pages only set what differs (data, colours, click).
const TEXT = '#4b5563';
ChartJS.defaults.font.family = 'inherit';
ChartJS.defaults.font.size = 12;
ChartJS.defaults.color = TEXT;
ChartJS.defaults.animation = false;
ChartJS.defaults.plugins.legend.labels.boxWidth = 10;
ChartJS.defaults.plugins.legend.labels.boxHeight = 10;
ChartJS.defaults.plugins.tooltip.padding = 10;
ChartJS.defaults.plugins.tooltip.displayColors = true;
ChartJS.defaults.plugins.tooltip.titleFont = { size: 13, weight: '600' };
ChartJS.defaults.plugins.tooltip.bodyFont = { size: 12 };
ChartJS.defaults.scale.grid.color = 'rgba(0,0,0,.06)';
ChartJS.defaults.scale.border.display = false;
ChartJS.defaults.scales.linear.beginAtZero = true;
ChartJS.defaults.elements.bar.borderRadius = 4;
ChartJS.defaults.elements.arc.borderWidth = 2;
ChartJS.defaults.elements.arc.borderColor = '#fff';
ChartJS.defaults.elements.line.borderWidth = 2;

import { Line } from 'react-chartjs-2';

import { TARGET, round1 } from './logic';
import Panel, { Empty } from './Panel';
import { BRAND } from './chartKit';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (key) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}`;

export default function TrendCard({ trend }) {
  const data = {
    labels: trend.map((t) => monthLabel(t.month)),
    datasets: [
      {
        label: 'Average score',
        data: trend.map((t) => round1(t.percent)),
        borderColor: BRAND,
        backgroundColor: 'rgba(0,51,141,.08)',
        borderWidth: 2.5,
        tension: 0.3,
        pointRadius: 3,
        fill: true,
      },
      {
        label: `Target ${TARGET}%`,
        data: trend.map(() => TARGET),
        borderColor: '#9ca3af',
        borderDash: [5, 5],
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false,
      },
    ],
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { font: { size: 10 }, boxWidth: 10 } },
      tooltip: {
        callbacks: {
          afterLabel: (ctx) => (ctx.datasetIndex === 0 ? `${trend[ctx.dataIndex].count} audits` : ''),
        },
      },
    },
    scales: {
      y: { min: 40, max: 100, ticks: { font: { size: 10 }, callback: (v) => `${v}%` } },
      x: { ticks: { font: { size: 10 } }, grid: { display: false } },
    },
  };
  return (
    <Panel title="Trend" hint="Average score of audits submitted each month, for the audits shown.">
      {trend.length === 0 ? (
        <Empty>No audits match these filters.</Empty>
      ) : (
        <div className="relative h-[200px] w-full"><Line data={data} options={options} /></div>
      )}
    </Panel>
  );
}

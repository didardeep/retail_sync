import { Chart as ChartJS, BarController, LineController } from 'chart.js';
import { Chart } from 'react-chartjs-2';

import { round1 } from './logic';
import Panel, { Empty } from './Panel';
import { BRAND, truncate } from './chartKit';

// Mixed bar + line needs both controllers; chartSetup.js registers elements only.
ChartJS.register(BarController, LineController);

// Marks lost per question, biggest first, with the running share of all lost
// marks (the 80/20 line). Clicking a bar lists the audits that scored low on it.
export default function ParetoChart({ pareto, selectedCriterion, sectionLabel, onSelectCriterion }) {
  const { rows, totalLost, criteriaWithLoss } = pareto;
  const selectedIndex = rows.findIndex((r) => r.id === selectedCriterion);
  const data = {
    labels: rows.map((r) => truncate(r.title.split('\n')[0], 22)),
    datasets: [
      {
        type: 'bar',
        label: 'Marks lost',
        data: rows.map((r) => round1(r.lost)),
        backgroundColor: rows.map((_, i) => (selectedIndex < 0 || selectedIndex === i ? BRAND : `${BRAND}55`)),
        borderRadius: 4,
        yAxisID: 'y',
        order: 2,
      },
      {
        type: 'line',
        label: 'Cumulative share of lost marks',
        data: rows.map((r) => round1(r.cumulative)),
        borderColor: '#e02424',
        backgroundColor: '#e02424',
        borderWidth: 2,
        pointRadius: 3,
        tension: 0.25,
        yAxisID: 'y1',
        order: 1,
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
          title: (items) => rows[items[0].dataIndex].title.split('\n')[0],
          afterTitle: (items) => {
            const r = rows[items[0].dataIndex];
            return `${r.tool} section ${r.section}, scored ${round1(r.percent)}% on average`;
          },
        },
      },
    },
    scales: {
      y: { beginAtZero: true, title: { display: true, text: 'Marks lost', font: { size: 10 } }, ticks: { font: { size: 10 } } },
      y1: {
        position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false },
        ticks: { font: { size: 10 }, callback: (v) => `${v}%` },
      },
      x: { ticks: { font: { size: 9 }, maxRotation: 50, minRotation: 30 }, grid: { display: false } },
    },
    onClick: (_event, elements) => {
      const el = elements.find((e) => e.datasetIndex === 0) ?? elements[0];
      if (el) onSelectCriterion(rows[el.index].id);
    },
    onHover: (event, elements) => {
      const target = event.native?.target;
      if (target) target.style.cursor = elements.length ? 'pointer' : 'default';
    },
  };

  return (
    <Panel
      title="Where marks are lost"
      hint={`${sectionLabel ? `${sectionLabel} - ` : ''}Top ${rows.length} of ${criteriaWithLoss} questions, ${round1(totalLost)} marks lost in total. Click a bar to list the audits that scored low on it.`}
    >
      {rows.length === 0 ? (
        <Empty>No marks were lost in the audits shown.</Empty>
      ) : (
        <div className="relative h-[270px] w-full">
          <Chart type="bar" data={data} options={options} />
        </div>
      )}
    </Panel>
  );
}

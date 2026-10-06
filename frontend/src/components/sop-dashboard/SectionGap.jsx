import { Bar } from 'react-chartjs-2';

import { round1 } from './logic';
import Panel, { Empty } from './Panel';
import { bandColors, clickableBar, truncate } from './chartKit';

// Share of marks earned per section: the shortest bars are where to coach.
export default function SectionGap({ sections, showTool, selectedSection, onSelectSection }) {
  const selectedIndex = sections.findIndex((s) => s.key === selectedSection);
  const percents = sections.map((s) => round1(s.percent));
  const label = (s) => truncate(`${showTool ? `${s.tool} ` : ''}${s.code}. ${s.name}`, 34);
  const data = {
    labels: sections.map(label),
    datasets: [{
      data: percents,
      backgroundColor: bandColors(percents, selectedIndex >= 0 ? selectedIndex : null),
      borderRadius: 4,
    }],
  };
  const options = clickableBar({
    horizontal: true,
    percentAxis: true,
    onPick: (i) => onSelectSection(sections[i].key),
  });
  options.plugins.tooltip = {
    callbacks: {
      title: (items) => {
        const s = sections[items[0].dataIndex];
        return `${s.tool} section ${s.code}: ${s.name}`;
      },
      label: (ctx) => `${ctx.parsed.x}% of marks earned (${round1(100 - ctx.parsed.x)} pts below full marks)`,
    },
  };

  return (
    <Panel
      title="Gap by section"
      hint="Share of marks earned. Click a section to see which questions lose the most marks in it."
    >
      {sections.length === 0 ? (
        <Empty>No audits match these filters.</Empty>
      ) : (
        <div className="relative w-full" style={{ height: Math.max(170, sections.length * 34 + 40) }}>
          <Bar data={data} options={options} />
        </div>
      )}
    </Panel>
  );
}

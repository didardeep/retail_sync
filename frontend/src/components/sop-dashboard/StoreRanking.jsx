import { Bar } from 'react-chartjs-2';

import { round1 } from './logic';
import Panel, { Empty } from './Panel';
import { bandColors, clickableBar } from './chartKit';

export default function StoreRanking({ ranking, selectedStore, onSelectStore }) {
  const selectedIndex = ranking.findIndex((r) => r.store_id === selectedStore);
  const percents = ranking.map((r) => round1(r.percent));
  const data = {
    labels: ranking.map((r) => r.name),
    datasets: [{
      data: percents,
      backgroundColor: bandColors(percents, selectedIndex >= 0 ? selectedIndex : null),
      borderRadius: 4,
    }],
  };
  const options = {
    ...clickableBar({
      horizontal: true,
      percentAxis: true,
      onPick: (i) => onSelectStore(ranking[i].store_id),
    }),
  };
  options.plugins.tooltip = {
    callbacks: {
      label: (ctx) => {
        const r = ranking[ctx.dataIndex];
        return r.tools.map((t) => `${t.code}: ${round1(t.percent)}%`);
      },
    },
  };

  return (
    <Panel
      title="Store ranking"
      hint="Latest score per store (average of the latest audit for each tool). Click a bar to focus on that store."
    >
      {ranking.length === 0 ? (
        <Empty>No audits match these filters.</Empty>
      ) : (
        <div className="relative w-full" style={{ height: Math.max(170, ranking.length * 30 + 40) }}>
          <Bar data={data} options={options} />
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <span><i className="mr-1 inline-block size-2 rounded-sm bg-[#0e9f6e]" />80% and above</span>
        <span><i className="mr-1 inline-block size-2 rounded-sm bg-[#f59e0b]" />70 to 80%</span>
        <span><i className="mr-1 inline-block size-2 rounded-sm bg-[#e02424]" />below 70%</span>
      </div>
    </Panel>
  );
}

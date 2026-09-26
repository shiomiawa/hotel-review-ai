import { dayLabel, formatAvg, monthLabel, type MonthStat, type RatingStats } from "@/lib/stats";

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <span className="text-sm text-zinc-600 dark:text-zinc-400">{label}</span>
      {children}
    </div>
  );
}

const Value = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <span className={`text-3xl font-semibold ${className}`}>{children}</span>
);

// 平均点の差。色だけに頼らず、矢印と言葉でも上下を伝える
function DiffTile({ label, diff, base, current }: { label: string; diff: number | null; base: MonthStat; current: MonthStat }) {
  const rounded = diff === null ? null : Math.round(diff * 100) / 100;
  const detail = (
    <span className="text-xs text-zinc-500">
      {monthLabel(base.month)} {formatAvg(base.avg)}（{base.count}件）→ {monthLabel(current.month)}{" "}
      {formatAvg(current.avg)}
    </span>
  );

  if (rounded === null) {
    return (
      <Tile label={label}>
        <Value className="text-zinc-400">―</Value>
        <span className="text-sm text-zinc-500">比較できるデータがありません</span>
        {detail}
      </Tile>
    );
  }
  const direction = rounded > 0 ? "up" : rounded < 0 ? "down" : "flat";
  const color =
    direction === "up" ? "text-[var(--delta-up)]" : direction === "down" ? "text-[var(--delta-down)]" : "";
  return (
    <Tile label={label}>
      <Value className={color}>
        {direction === "up" ? "+" : direction === "down" ? "−" : "±"}
        {Math.abs(rounded).toFixed(2)}
      </Value>
      <span className={`text-sm font-medium ${color}`}>
        {direction === "up" ? "▲ 上昇" : direction === "down" ? "▼ 低下" : "変化なし"}
      </span>
      {detail}
    </Tile>
  );
}

export function StatTiles({ stats }: { stats: RatingStats }) {
  const { today, todayStat, thisMonth } = stats;
  const monthName = `${Number(thisMonth.month.slice(5, 7))}月`;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Tile label={`当日の平均（${dayLabel(today)}）`}>
        <Value>{formatAvg(todayStat.avg)}</Value>
        <span className="text-sm text-zinc-500">{todayStat.count}件</span>
      </Tile>
      <Tile label={`今月の平均（${monthName}1日〜${dayLabel(today)}）`}>
        <Value>{formatAvg(thisMonth.avg)}</Value>
        <span className="text-sm text-zinc-500">{thisMonth.count}件</span>
      </Tile>
      <DiffTile label="前月比（平均点の差）" diff={stats.momDiff} base={stats.prevMonth} current={thisMonth} />
      <DiffTile label="前年比（平均点の差）" diff={stats.yoyDiff} base={stats.lastYearMonth} current={thisMonth} />
    </div>
  );
}

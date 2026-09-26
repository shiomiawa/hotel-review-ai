"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import {
  dayLabel,
  formatAvg,
  monthLabel,
  shortMonthLabel,
  type DayStat,
  type MonthStat,
  type RatingStats,
} from "@/lib/stats";

// 色は globals.css の --chart-* で、明るい画面・暗い画面を切り替える
const SERIES = "var(--chart-series)";
const GRID = "var(--chart-grid)";
const AXIS = "var(--chart-axis)";
const MUTED = "var(--chart-muted)";
const SURFACE = "var(--background)";
const TEXT = "var(--foreground)";

const axisProps = {
  stroke: AXIS,
  tick: { fill: MUTED, fontSize: 12 },
  tickLine: false,
} as const;

// 点の周りに背景色の縁取りを付け、線と重なっても見やすくする
const dotProps = { r: 4, fill: SERIES, stroke: SURFACE, strokeWidth: 2 };

// ツールチップ：数値を大きく、期間と件数を小さく
function ChartTooltip({
  active,
  payload,
  title,
  value,
}: TooltipContentProps & {
  title: (d: MonthStat | DayStat) => string;
  value: (d: MonthStat | DayStat) => string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as MonthStat | DayStat;
  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="text-base font-semibold">{value(d)}</div>
      <div className="text-xs text-zinc-500">{title(d)}</div>
    </div>
  );
}

// 平均評価の縦軸：データに合わせて下限を決め、小さな変化も見えるようにする（0.5刻み）
function ratingTicks(values: (number | null)[]): number[] {
  const nums = values.filter((v): v is number => v !== null);
  const min = nums.length ? Math.min(...nums) : 1;
  const lower = Math.max(1, Math.floor(min * 2) / 2 - 0.5);
  const ticks: number[] = [];
  for (let t = lower; t <= 5; t += 0.5) ticks.push(t);
  return ticks;
}

// 件数の縦軸：0, 10, 20… のようなきりのいい目盛りにする
function countTicks(values: number[]): number[] {
  const max = Math.max(1, ...values);
  const step = max <= 10 ? 2 : max <= 25 ? 5 : max <= 50 ? 10 : Math.ceil(max / 5 / 10) * 10;
  const ticks: number[] = [];
  for (let t = 0; t < max + step; t += step) ticks.push(t);
  return ticks;
}

const periodTitle = (d: MonthStat | DayStat) =>
  "month" in d ? `${monthLabel(d.month)}・${d.count}件` : `${dayLabel(d.date)}・${d.count}件`;

// グラフと同じ数値を表でも見られるようにする（色が見分けにくい人・印刷向け）
function DataTable({ rows }: { rows: { label: string; count: number; avg: number | null }[] }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-zinc-600 dark:text-zinc-400">表で見る</summary>
      <table className="mt-2 w-full max-w-md text-left tabular-nums">
        <thead className="text-zinc-500">
          <tr>
            <th className="py-1 font-normal">期間</th>
            <th className="py-1 text-right font-normal">件数</th>
            <th className="py-1 text-right font-normal">平均評価</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {rows.map((r) => (
            <tr key={r.label}>
              <td className="py-1">{r.label}</td>
              <td className="py-1 text-right">{r.count}</td>
              <td className="py-1 text-right">{formatAvg(r.avg)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function ChartCard({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div>
        <h3 className="font-semibold">{title}</h3>
        {note && <p className="text-xs text-zinc-500">{note}</p>}
      </div>
      {children}
    </div>
  );
}

export function RatingCharts({ stats }: { stats: RatingStats }) {
  const { months, days, sites, today } = stats;
  const lastIndex = months.length - 1;
  const monthRows = months.map((m) => ({ label: monthLabel(m.month), count: m.count, avg: m.avg }));
  const monthAvgTicks = ratingTicks(months.map((m) => m.avg));
  const monthCountTicks = countTicks(months.map((m) => m.count));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ChartCard
        title="月別の平均評価"
        note={`縦軸は${monthAvgTicks[0].toFixed(1)}〜5.0（変化を見やすくするため）。${monthLabel(months[lastIndex].month)}は${dayLabel(today)}までの集計`}
      >
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={months} margin={{ top: 16, right: 40, bottom: 0, left: -20 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="month" tickFormatter={shortMonthLabel} {...axisProps} />
            <YAxis
              domain={[monthAvgTicks[0], 5]}
              ticks={monthAvgTicks}
              tickFormatter={(v: number) => v.toFixed(1)}
              {...axisProps}
              axisLine={false}
            />
            <Tooltip
              cursor={{ stroke: AXIS }}
              content={(p) => <ChartTooltip {...p} title={periodTitle} value={(d) => `平均 ${formatAvg(d.avg)}`} />}
            />
            <Line
              dataKey="avg"
              stroke={SERIES}
              strokeWidth={2}
              dot={dotProps}
              activeDot={{ ...dotProps, r: 6 }}
              connectNulls={false}
              isAnimationActive={false}
              // 最新月だけ数値を添える（すべての点に数字を付けると読みにくい）
              label={({ x, y, index }) =>
                index === lastIndex && months[lastIndex].avg !== null ? (
                  <text x={Number(x) + 8} y={Number(y) - 8} fill={TEXT} fontSize={12} fontWeight={600}>
                    {formatAvg(months[lastIndex].avg)}
                  </text>
                ) : null
              }
            />
          </LineChart>
        </ResponsiveContainer>
        <DataTable rows={monthRows} />
      </ChartCard>

      <ChartCard title="月別の口コミ件数" note={`${monthLabel(months[lastIndex].month)}は${dayLabel(today)}まで`}>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={months} margin={{ top: 16, right: 16, bottom: 0, left: -20 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="month" tickFormatter={shortMonthLabel} {...axisProps} />
            <YAxis
              domain={[0, monthCountTicks[monthCountTicks.length - 1]]}
              ticks={monthCountTicks}
              {...axisProps}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: GRID, opacity: 0.5 }}
              content={(p) => <ChartTooltip {...p} title={(d) => periodTitle(d).split("・")[0]} value={(d) => `${d.count}件`} />}
            />
            <Bar dataKey="count" fill={SERIES} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
        <DataTable rows={monthRows} />
      </ChartCard>

      <ChartCard title="今月の日別平均評価" note="口コミがない日は線が途切れます">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={days} margin={{ top: 16, right: 16, bottom: 0, left: -20 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="date" tickFormatter={dayLabel} {...axisProps} minTickGap={16} />
            <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} {...axisProps} axisLine={false} />
            <Tooltip
              cursor={{ stroke: AXIS }}
              content={(p) => (
                <ChartTooltip
                  {...p}
                  title={periodTitle}
                  value={(d) => (d.avg === null ? "口コミなし" : `平均 ${formatAvg(d.avg)}`)}
                />
              )}
            />
            <Line
              dataKey="avg"
              stroke={SERIES}
              strokeWidth={2}
              dot={dotProps}
              activeDot={{ ...dotProps, r: 6 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
        <DataTable rows={days.map((d) => ({ label: dayLabel(d.date), count: d.count, avg: d.avg }))} />
      </ChartCard>

      <ChartCard title="今月のサイト別平均評価">
        <table className="w-full text-left text-sm tabular-nums">
          <thead className="text-zinc-500">
            <tr>
              <th className="py-1 font-normal">サイト</th>
              <th className="py-1 text-right font-normal">件数</th>
              <th className="py-1 text-right font-normal">平均評価</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {sites.map((s) => (
              <tr key={s.site}>
                <td className="py-2">{s.site}</td>
                <td className="py-2 text-right">{s.count}</td>
                <td className="py-2 text-right font-semibold">{formatAvg(s.avg)}</td>
              </tr>
            ))}
            {sites.length === 0 && (
              <tr>
                <td colSpan={3} className="py-2 text-zinc-500">
                  今月の口コミはまだありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </ChartCard>
    </div>
  );
}

"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export interface StatusDistributionDatum {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}

const SERIES: Array<{ key: keyof StatusDistributionDatum; label: string; color: string }> = [
  { key: "sent", label: "Sent", color: "var(--color-muted-foreground)" },
  { key: "delivered", label: "Delivered", color: "var(--color-success)" },
  { key: "read", label: "Read", color: "var(--color-primary)" },
  { key: "failed", label: "Failed", color: "var(--color-destructive)" },
];

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="inline-block size-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium">{p.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

/** A single horizontal stacked bar showing the part-to-whole breakdown of processed messages by status. */
export function StatusDistributionChart({ data }: { data: StatusDistributionDatum }) {
  const total = data.sent + data.delivered + data.read + data.failed;

  if (total === 0) {
    return (
      <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
        No messages sent yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <ResponsiveContainer width="100%" height={64}>
        <BarChart data={[data]} layout="vertical" barCategoryGap={0} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <XAxis type="number" hide domain={[0, total]} />
          <YAxis type="category" hide dataKey={() => "status"} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "transparent" }} />
          {SERIES.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="status"
              fill={s.color}
              radius={
                i === 0
                  ? [4, 0, 0, 4]
                  : i === SERIES.length - 1
                    ? [0, 4, 4, 0]
                    : 0
              }
              maxBarSize={24}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {SERIES.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span className="inline-block size-2 rounded-full" style={{ background: s.color }} />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="font-medium">{data[s.key].toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

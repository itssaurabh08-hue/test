"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

export interface CampaignBarDatum {
  name: string;
  sent: number;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: CampaignBarDatum }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="font-medium">{d.name}</p>
      <p className="text-muted-foreground">{d.sent.toLocaleString()} sent</p>
    </div>
  );
}

/** Horizontal magnitude comparison of messages sent across the most recent campaigns. */
export function RecentCampaignsChart({ data }: { data: CampaignBarDatum[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
        No campaigns yet.
      </div>
    );
  }

  const height = Math.max(data.length * 32, 60);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 4 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="name"
          width={140}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--color-accent)" }} />
        <Bar dataKey="sent" radius={[0, 4, 4, 0]} maxBarSize={20}>
          {data.map((_, i) => (
            <Cell key={i} fill="var(--color-primary)" />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

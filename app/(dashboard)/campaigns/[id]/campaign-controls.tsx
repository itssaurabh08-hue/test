"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

async function callAction(campaignId: string, action: string): Promise<{ error?: string }> {
  const res = await fetch(`/api/campaigns/${campaignId}/${action}`, { method: "POST" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: data?.error ?? `Failed to ${action} campaign.` };
  return {};
}

export function CampaignControls({
  campaignId,
  status,
  hasFailedRetryable,
}: {
  campaignId: string;
  status: string;
  hasFailedRetryable?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: string) {
    setPending(action);
    setError(null);
    const result = await callAction(campaignId, action);
    setPending(null);
    if (result.error) {
      setError(result.error);
    } else {
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {status === "DRAFT" && (
          <Button onClick={() => run("start")} disabled={pending === "start"}>
            {pending === "start" ? "Starting…" : "Start campaign"}
          </Button>
        )}
        {status === "RUNNING" && (
          <>
            <Button variant="outline" onClick={() => run("pause")} disabled={pending === "pause"}>
              {pending === "pause" ? "Pausing…" : "Pause"}
            </Button>
            <Button variant="destructive" onClick={() => run("cancel")} disabled={pending === "cancel"}>
              Cancel
            </Button>
          </>
        )}
        {status === "PAUSED" && (
          <>
            <Button onClick={() => run("resume")} disabled={pending === "resume"}>
              {pending === "resume" ? "Resuming…" : "Resume"}
            </Button>
            <Button variant="destructive" onClick={() => run("cancel")} disabled={pending === "cancel"}>
              Cancel
            </Button>
          </>
        )}
        {(status === "COMPLETED" || status === "FAILED") && hasFailedRetryable && (
          <Button variant="outline" onClick={() => run("retry")} disabled={pending === "retry"}>
            {pending === "retry" ? "Retrying…" : "Retry failed"}
          </Button>
        )}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

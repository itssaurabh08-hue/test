import { prisma } from "@/lib/db/prisma";
import { SuppressionManager } from "./suppression-manager";

export default async function SuppressionSettingsPage() {
  const activeCount = await prisma.suppression.count({ where: { removedAt: null } });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Suppression list</h1>
        <p className="text-sm text-muted-foreground">
          Phone numbers excluded from every campaign — added automatically when a
          contact replies STOP/UNSUBSCRIBE/OPT OUT/REMOVE/CANCEL, or manually below.
          Removing a number here is an explicit action and re-enables it for future
          campaigns.
        </p>
      </div>
      <SuppressionManager initialActiveCount={activeCount} />
    </div>
  );
}

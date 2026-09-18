import { CampaignWizard } from "./campaign-wizard";

export default function NewCampaignPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">New campaign</h1>
        <p className="text-sm text-muted-foreground">
          Select a template, choose recipients, map variables, and review before sending.
        </p>
      </div>
      <CampaignWizard />
    </div>
  );
}

import Link from "next/link";
import { requireUser } from "@/lib/auth/dal";
import { isMockMode, getEnv } from "@/lib/env";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function SettingsPage() {
  const session = await requireUser();
  const env = getEnv();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Account and integration configuration.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p>{session.name} ({session.email})</p>
          <p className="text-muted-foreground">Role: {session.role}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Meta WhatsApp Cloud API</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Mode:</span>
            {isMockMode() ? (
              <Badge variant="warning">Mock (development)</Badge>
            ) : (
              <Badge variant="success">Live — Meta Cloud API</Badge>
            )}
          </div>
          <p className="text-muted-foreground">
            Graph API version: <span className="font-mono">{env.META_GRAPH_API_VERSION}</span>
          </p>
          <p className="text-muted-foreground">
            Phone Number ID configured: {env.META_PHONE_NUMBER_ID ? "yes" : "no"}
          </p>
          <p className="text-muted-foreground">
            WABA ID configured: {env.META_WABA_ID ? "yes" : "no"}
          </p>
          <p className="text-xs text-muted-foreground">
            Credentials are set via environment variables and never exposed to the browser.
            See <Link className="underline" href="/settings/pricing">pricing</Link> to configure
            estimated cost rates,{" "}
            <Link className="underline" href="/settings/suppression">suppression list</Link> to
            manage opted-out contacts, and{" "}
            {session.role === "ADMIN" ? (
              <Link className="underline" href="/settings/audit-log">audit log</Link>
            ) : (
              "audit log (admin only)"
            )}{" "}
            to review recent account activity.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

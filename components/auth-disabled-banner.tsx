import { isAuthDisabled } from "@/lib/env";

export function AuthDisabledBanner() {
  if (!isAuthDisabled()) return null;
  return (
    <div className="w-full bg-destructive px-4 py-1.5 text-center text-xs font-semibold tracking-wide text-destructive-foreground">
      LOGIN DISABLED (DISABLE_AUTH=true) — anyone with this URL has full access. Preview only.
    </div>
  );
}

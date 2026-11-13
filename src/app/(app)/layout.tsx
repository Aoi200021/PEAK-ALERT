import { AppShell } from "@/components/app-shell";
import { SetupNotice } from "@/components/setup-notice";
import { publicSupabaseEnv } from "@/lib/env";

export default function AppLayout({ children }: LayoutProps<"/">) {
  if (!publicSupabaseEnv().configured) {
    return (
      <div className="px-4 py-20">
        <SetupNotice />
      </div>
    );
  }
  return <AppShell>{children}</AppShell>;
}

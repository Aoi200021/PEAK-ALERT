import { Panel } from "./ui";

/** Shown to the site owner when Supabase env vars are missing. */
export function SetupNotice() {
  return (
    <Panel className="mx-auto max-w-lg p-6">
      <h2 className="text-sm font-semibold">Configure Supabase to continue</h2>
      <p className="mt-2 text-sm text-muted">
        <code className="num text-text">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
        <code className="num text-text">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> are missing. Copy <code className="num">.env.example</code> to{" "}
        <code className="num">.env.local</code>, fill it in and restart the server. Step-by-step guide in the README.
      </p>
    </Panel>
  );
}

import { Panel } from "./ui";

export function SetupNotice() {
  return (
    <Panel className="mx-auto max-w-lg p-6">
      <h2 className="text-sm font-semibold">Configura Supabase para continuar</h2>
      <p className="mt-2 text-sm text-muted">
        Faltan las variables <code className="num text-text">NEXT_PUBLIC_SUPABASE_URL</code> y{" "}
        <code className="num text-text">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>. Copia <code className="num">.env.example</code> a{" "}
        <code className="num">.env.local</code>, complétalo y reinicia el servidor. Instrucciones paso a paso en el README.
      </p>
    </Panel>
  );
}

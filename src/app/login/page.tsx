import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { AuthLayout } from "@/components/auth-layout";
import { SetupNotice } from "@/components/setup-notice";
import { publicSupabaseEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default function LoginPage() {
  if (!publicSupabaseEnv().configured) return <div className="px-4 py-20"><SetupNotice /></div>;
  return (
    <AuthLayout title="Inicia sesión" sub="Accede a tu dashboard y alertas.">
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
    </AuthLayout>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { AuthLayout } from "@/components/auth-layout";
import { SetupNotice } from "@/components/setup-notice";
import { publicSupabaseEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function SignupPage() {
  if (!publicSupabaseEnv().configured) return <div className="px-4 py-20"><SetupNotice /></div>;
  return (
    <AuthLayout title="Crea tu cuenta" sub="Gratis: sigue hasta 2 tokens con alertas básicas.">
      <Suspense>
        <AuthForm mode="signup" />
      </Suspense>
    </AuthLayout>
  );
}

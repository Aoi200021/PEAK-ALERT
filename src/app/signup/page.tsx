import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { AuthLayout } from "@/components/auth-layout";
import { SetupNotice } from "@/components/setup-notice";
import { publicSupabaseEnv } from "@/lib/env";
import { getLocale } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignupPage() {
  const locale = await getLocale();
  const es = locale === "es";
  if (!publicSupabaseEnv().configured) return <div className="px-4 py-20"><SetupNotice /></div>;
  return (
    <AuthLayout locale={locale} title={es ? "Crea tu cuenta" : "Create your account"} sub={es ? "Gratis: monitorea hasta 3 tokens con su puntuación de riesgo." : "Free: track up to 3 tokens with their risk score."}>
      <Suspense>
        <AuthForm mode="signup" />
      </Suspense>
    </AuthLayout>
  );
}

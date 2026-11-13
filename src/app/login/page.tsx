import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { AuthLayout } from "@/components/auth-layout";
import { SetupNotice } from "@/components/setup-notice";
import { publicSupabaseEnv } from "@/lib/env";
import { getLocale } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage() {
  const locale = await getLocale();
  const es = locale === "es";
  if (!publicSupabaseEnv().configured) return <div className="px-4 py-20"><SetupNotice /></div>;
  return (
    <AuthLayout locale={locale} title={es ? "Inicia sesión" : "Log in"} sub={es ? "Accede a tu dashboard y alertas." : "Access your dashboard and alerts."}>
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
    </AuthLayout>
  );
}

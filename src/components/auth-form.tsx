"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, ErrorNote, Field, Input } from "./ui";
import { useI18n } from "@/lib/i18n/client";

function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState<"password" | "magic" | null>(null);
  const [error, setError] = useState<string | null>(params.get("error"));
  const [info, setInfo] = useState<string | null>(null);

  const redirectTo = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading("password");
    const supabase = createClient();
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push(next);
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo() },
        });
        if (error) throw error;
        if (data.session) {
          router.push(next);
          router.refresh();
        } else {
          setInfo(t("We sent you a confirmation email. Open the link to activate your account.", "Te enviamos un email de confirmación. Abre el enlace para activar tu cuenta."));
        }
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : "Error";
      setError(
        m.includes("Invalid login credentials")
          ? t("Wrong email or password.", "Email o contraseña incorrectos.")
          : m.includes("Email not confirmed")
            ? t("Confirm your email before logging in.", "Confirma tu email antes de iniciar sesión.")
            : m,
      );
    } finally {
      setLoading(null);
    }
  }

  async function magicLink() {
    setError(null);
    setInfo(null);
    if (!email) return setError(t("Enter your email first.", "Escribe tu email primero."));
    setLoading("magic");
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo() },
    });
    setLoading(null);
    if (error) setError(error.message);
    else setInfo(t("Check your email: we sent you a sign-in link.", "Revisa tu email: te enviamos un enlace para entrar."));
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Email">
        <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("you@email.com", "tu@email.com")} />
      </Field>
      <Field label={t("Password", "Contraseña")} hint={mode === "signup" ? t("At least 8 characters.", "Mínimo 8 caracteres.") : undefined}>
        <Input
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
          minLength={mode === "signup" ? 8 : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      {error && <ErrorNote>{error}</ErrorNote>}
      {info && <p className="rounded-md border border-up/25 bg-up/5 px-3 py-2 text-sm text-up">{info}</p>}
      {mode === "signup" && (
        <p className="text-[11px] leading-relaxed text-faint">
          {t("By creating an account you agree to the", "Al crear una cuenta aceptas los")}{" "}
          <Link href="/terms" className="text-muted underline underline-offset-2">{t("Terms of Service", "Términos de servicio")}</Link>{" "}
          {t("and the", "y el")}{" "}
          <Link href="/privacy" className="text-muted underline underline-offset-2">{t("Privacy Policy", "Aviso de privacidad")}</Link>.
        </p>
      )}
      <Button type="submit" variant="primary" className="w-full" loading={loading === "password"}>
        {mode === "login" ? t("Log in", "Entrar") : t("Create account", "Crear cuenta")}
      </Button>
      {mode === "login" && (
        <Button type="button" variant="ghost" className="w-full" onClick={magicLink} loading={loading === "magic"}>
          {t("Email me a magic link", "Enviarme un enlace mágico")}
        </Button>
      )}
      <p className="text-center text-xs text-muted">
        {mode === "login" ? (
          <>{t("Don't have an account?", "¿No tienes cuenta?")} <Link href={`/signup${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-text underline underline-offset-2">{t("Sign up", "Regístrate")}</Link></>
        ) : (
          <>{t("Already have an account?", "¿Ya tienes cuenta?")} <Link href="/login" className="text-text underline underline-offset-2">{t("Log in", "Inicia sesión")}</Link></>
        )}
      </p>
    </form>
  );
}

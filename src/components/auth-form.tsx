"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, ErrorNote, Field, Input } from "./ui";

function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
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
          setInfo("Te enviamos un email de confirmación. Abre el enlace para activar tu cuenta.");
        }
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : "Error";
      setError(
        m.includes("Invalid login credentials")
          ? "Email o contraseña incorrectos."
          : m.includes("Email not confirmed")
            ? "Confirma tu email antes de iniciar sesión."
            : m,
      );
    } finally {
      setLoading(null);
    }
  }

  async function magicLink() {
    setError(null);
    setInfo(null);
    if (!email) return setError("Escribe tu email primero.");
    setLoading("magic");
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo() },
    });
    setLoading(null);
    if (error) setError(error.message);
    else setInfo("Revisa tu email: te enviamos un enlace para entrar.");
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Email">
        <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" />
      </Field>
      <Field label="Contraseña" hint={mode === "signup" ? "Mínimo 8 caracteres." : undefined}>
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
      <Button type="submit" variant="primary" className="w-full" loading={loading === "password"}>
        {mode === "login" ? "Entrar" : "Crear cuenta"}
      </Button>
      {mode === "login" && (
        <Button type="button" variant="ghost" className="w-full" onClick={magicLink} loading={loading === "magic"}>
          Enviarme un enlace mágico
        </Button>
      )}
      <p className="text-center text-xs text-muted">
        {mode === "login" ? (
          <>¿No tienes cuenta? <Link href={`/signup${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-text underline underline-offset-2">Regístrate</Link></>
        ) : (
          <>¿Ya tienes cuenta? <Link href="/login" className="text-text underline underline-offset-2">Inicia sesión</Link></>
        )}
      </p>
    </form>
  );
}

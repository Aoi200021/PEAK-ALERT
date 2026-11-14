"use client";

import { LegalPage, Section, SupportContact } from "@/components/legal-page";
import { useI18n } from "@/lib/i18n/client";

export default function RefundsPage() {
  const { t } = useI18n();
  return (
    <LegalPage title={t("Refunds & Cancellation", "Reembolsos y cancelación")}>
      <Section title={t("Free plan", "Plan Free")}>
        <p>{t("The Free plan has no cost and requires no payment details.", "El plan Free no tiene costo y no requiere datos de pago.")}</p>
      </Section>

      <Section title={t("Cancel anytime", "Cancela cuando quieras")}>
        <p>
          {t(
            "Pro and Premium are monthly subscriptions. You can cancel at any time from Settings → Manage subscription, with no penalty. After cancelling you keep your paid features until the end of the period you already paid for, and then your account moves to the Free plan. Your data is kept.",
            "Pro y Premium son suscripciones mensuales. Puedes cancelar en cualquier momento desde Ajustes → Gestionar suscripción, sin penalización. Al cancelar conservas las funciones de pago hasta el final del periodo que ya pagaste y después tu cuenta pasa al plan Free. Tus datos se conservan.",
          )}
        </p>
      </Section>

      <Section title={t("Refunds", "Reembolsos")}>
        <p>
          {t(
            "First payment: if PeakAlert isn't for you, ask for a refund within 7 days of your first payment for a plan and we'll refund it in full.",
            "Primer pago: si PeakAlert no es para ti, pide el reembolso dentro de los 7 días siguientes a tu primer pago de un plan y te lo devolveremos completo.",
          )}
        </p>
        <p>
          {t(
            "Renewals: monthly renewals are not refunded for partial periods, but you can cancel at any time to stop future charges.",
            "Renovaciones: las renovaciones mensuales no se reembolsan por periodos parciales, pero puedes cancelar en cualquier momento para evitar cargos futuros.",
          )}
        </p>
        <p>
          {t(
            "Billing errors: if you were charged by mistake (for example, twice), we'll refund the incorrect charge.",
            "Errores de cobro: si se te cobró por error (por ejemplo, dos veces), te devolveremos el cargo incorrecto.",
          )}
        </p>
        <p>
          {t(
            "Refunds go back to the original payment method through Stripe and usually take 5–10 business days to appear, depending on your bank. This policy doesn't limit any rights you have under consumer-protection law.",
            "Los reembolsos se devuelven al método de pago original a través de Stripe y suelen tardar de 5 a 10 días hábiles en reflejarse, según tu banco. Esta política no limita los derechos que te otorgue la legislación de protección al consumidor.",
          )}
        </p>
      </Section>

      <Section title={t("How to request a refund", "Cómo pedir un reembolso")}>
        <p>
          {t("Write to", "Escribe a")} <SupportContact />{" "}
          {t("from your account email, indicating the charge date and amount.", "desde el email de tu cuenta, indicando la fecha y el monto del cargo.")}
        </p>
      </Section>
    </LegalPage>
  );
}

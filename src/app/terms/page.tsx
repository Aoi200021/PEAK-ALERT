"use client";

import Link from "next/link";
import { LegalPage, Section, SupportContact } from "@/components/legal-page";
import { useI18n } from "@/lib/i18n/client";

export default function TermsPage() {
  const { t } = useI18n();
  return (
    <LegalPage title={t("Terms of Service", "Términos de servicio")}>
      <p>
        {t(
          "These Terms govern your use of PeakAlert (the “Service”), a web application operated from Mexico. By creating an account or using the Service you agree to these Terms. If you don't agree, don't use the Service.",
          "Estos Términos regulan el uso de PeakAlert (el “Servicio”), una aplicación web operada desde México. Al crear una cuenta o usar el Servicio aceptas estos Términos. Si no estás de acuerdo, no uses el Servicio.",
        )}
      </p>

      <Section title={t("1. What PeakAlert is", "1. Qué es PeakAlert")}>
        <p>
          {t(
            "PeakAlert is a monitoring and analysis tool for crypto tokens (“memecoins”). It shows public market data, computes a momentum-exhaustion risk score with transparent rules, sends alerts you configure and helps you track your own positions.",
            "PeakAlert es una herramienta de monitoreo y análisis de tokens cripto (“memecoins”). Muestra datos públicos de mercado, calcula una puntuación de riesgo de agotamiento del impulso con reglas transparentes, envía las alertas que configuras y te ayuda a seguir tus propias posiciones.",
          )}
        </p>
        <p>
          {t(
            "PeakAlert never executes trades, never holds or accesses your funds, never asks for your private keys or seed phrase and is not a broker, exchange or wallet.",
            "PeakAlert nunca ejecuta operaciones, nunca guarda ni accede a tus fondos, nunca te pide tus claves privadas ni tu frase semilla y no es un bróker, exchange ni wallet.",
          )}
        </p>
      </Section>

      <Section title={t("2. Not financial advice", "2. No es asesoramiento financiero")}>
        <p>
          {t(
            "Nothing in the Service is financial, investment, legal or tax advice, or a recommendation to buy, sell or hold any asset. The risk score and alerts are heuristic signals, not predictions or probabilities, and they can be wrong. Prices can keep rising after a high score or fall without any alert.",
            "Nada en el Servicio es asesoramiento financiero, de inversión, legal ni fiscal, ni una recomendación de comprar, vender o mantener ningún activo. La puntuación de riesgo y las alertas son señales heurísticas, no predicciones ni probabilidades, y pueden equivocarse. El precio puede seguir subiendo con una puntuación alta o caer sin ninguna alerta.",
          )}
        </p>
        <p>
          {t(
            "Memecoins are extremely volatile and risky; you can lose all the money you invest. You are solely responsible for your trading decisions.",
            "Los memecoins son extremadamente volátiles y riesgosos; puedes perder todo el dinero que inviertas. Eres el único responsable de tus decisiones de trading.",
          )}
        </p>
      </Section>

      <Section title={t("3. Market data and availability", "3. Datos de mercado y disponibilidad")}>
        <p>
          {t(
            "Market data comes from third parties (such as DexScreener, Jupiter and Birdeye) and may be delayed, incomplete or inaccurate. Alerts depend on that data, on our servers and on push-notification services (Apple, Google, Microsoft, Mozilla), so they may arrive late or not at all.",
            "Los datos de mercado provienen de terceros (como DexScreener, Jupiter y Birdeye) y pueden llegar con retraso, estar incompletos o ser inexactos. Las alertas dependen de esos datos, de nuestros servidores y de los servicios de notificaciones push (Apple, Google, Microsoft, Mozilla), por lo que pueden llegar tarde o no llegar.",
          )}
        </p>
        <p>
          {t(
            "The Service is provided “as is” and “as available”. We don't guarantee it will be uninterrupted or error-free, and you shouldn't rely on it as your only risk-management tool.",
            "El Servicio se ofrece “tal cual” y “según disponibilidad”. No garantizamos que funcione sin interrupciones ni errores, y no debes usarlo como tu única herramienta de gestión de riesgo.",
          )}
        </p>
      </Section>

      <Section title={t("4. Your account", "4. Tu cuenta")}>
        <p>
          {t(
            "You must be at least 18 years old and provide a valid email. Keep your password secure; you're responsible for activity on your account. Don't use the Service for anything illegal, don't try to access other users' data and don't overload, scrape or attack the Service.",
            "Debes tener al menos 18 años y dar un email válido. Mantén segura tu contraseña; eres responsable de la actividad en tu cuenta. No uses el Servicio para nada ilegal, no intentes acceder a datos de otros usuarios y no sobrecargues, extraigas datos masivamente ni ataques el Servicio.",
          )}
        </p>
        <p>
          {t(
            "We may suspend or close accounts that break these Terms. You can delete your account at any time by contacting us.",
            "Podemos suspender o cerrar cuentas que incumplan estos Términos. Puedes eliminar tu cuenta en cualquier momento escribiéndonos.",
          )}
        </p>
      </Section>

      <Section title={t("5. Plans, payments and cancellation", "5. Planes, pagos y cancelación")}>
        <p>
          {t(
            "The Free plan costs nothing. Paid plans (Pro and Premium) are monthly subscriptions billed in advance through Stripe, and they renew automatically until you cancel. Prices are shown on the",
            "El plan Free no tiene costo. Los planes de pago (Pro y Premium) son suscripciones mensuales que se cobran por adelantado a través de Stripe y se renuevan automáticamente hasta que canceles. Los precios aparecen en la",
          )}{" "}
          <Link href="/pricing" className="text-text underline underline-offset-2">{t("pricing page", "página de precios")}</Link>.
        </p>
        <p>
          {t(
            "You can cancel anytime from Settings → Manage subscription; you keep access until the end of the paid period. See our",
            "Puedes cancelar cuando quieras desde Ajustes → Gestionar suscripción; conservas el acceso hasta el final del periodo pagado. Consulta nuestra",
          )}{" "}
          <Link href="/refunds" className="text-text underline underline-offset-2">{t("Refunds & Cancellation policy", "política de reembolsos y cancelación")}</Link>.{" "}
          {t(
            "We may change prices with at least 30 days' notice; changes apply from your next billing period.",
            "Podemos cambiar los precios avisando con al menos 30 días de antelación; los cambios se aplican a partir de tu siguiente periodo de facturación.",
          )}
        </p>
      </Section>

      <Section title={t("6. Limitation of liability", "6. Limitación de responsabilidad")}>
        <p>
          {t(
            "To the maximum extent permitted by law, PeakAlert is not liable for trading losses, missed opportunities, lost profits or any indirect damages arising from your use of the Service, including late, missing or incorrect alerts or data. Our total liability is limited to the amount you paid us in the 3 months before the claim.",
            "En la máxima medida permitida por la ley, PeakAlert no es responsable de pérdidas de trading, oportunidades perdidas, lucro cesante ni daños indirectos derivados del uso del Servicio, incluidas alertas o datos tardíos, ausentes o incorrectos. Nuestra responsabilidad total se limita a lo que nos hayas pagado en los 3 meses anteriores a la reclamación.",
          )}
        </p>
      </Section>

      <Section title={t("7. Changes and governing law", "7. Cambios y ley aplicable")}>
        <p>
          {t(
            "We may update these Terms; we'll post the new version here and notify you of material changes. These Terms are governed by the laws of Mexico, without prejudice to any consumer rights you have under the laws of your country of residence.",
            "Podemos actualizar estos Términos; publicaremos la nueva versión aquí y te avisaremos de los cambios importantes. Estos Términos se rigen por las leyes de México, sin perjuicio de los derechos como consumidor que te correspondan según las leyes de tu país de residencia.",
          )}
        </p>
      </Section>

      <Section title={t("8. Contact", "8. Contacto")}>
        <p>
          {t("Questions about these Terms:", "Preguntas sobre estos Términos:")} <SupportContact />
        </p>
      </Section>
    </LegalPage>
  );
}

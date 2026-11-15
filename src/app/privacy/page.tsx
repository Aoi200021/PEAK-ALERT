"use client";

import { LegalPage, Section, SupportContact } from "@/components/legal-page";
import { useI18n } from "@/lib/i18n/client";

export default function PrivacyPage() {
  const { t } = useI18n();
  const li = "ml-5 list-disc space-y-1.5";
  return (
    <LegalPage title={t("Privacy Policy", "Aviso de privacidad")}>
      <p>
        {t(
          "This Privacy Policy explains what personal data PeakAlert (the “Service”), operated from Mexico, collects and how it's used, in line with Mexico's Federal Law on the Protection of Personal Data Held by Private Parties (LFPDPPP).",
          "Este Aviso de privacidad explica qué datos personales recaba PeakAlert (el “Servicio”), operado desde México, y cómo se usan, conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP).",
        )}
      </p>

      <Section title={t("1. Data we collect", "1. Datos que recabamos")}>
        <ul className={li}>
          <li>{t("Account: your email address and a securely hashed password (managed by Supabase).", "Cuenta: tu email y tu contraseña cifrada de forma segura (gestionada por Supabase).")}</li>
          <li>
            {t(
              "What you enter in the app: tokens you follow, alerts you create and positions you record (entry price, amount invested, sale price).",
              "Lo que introduces en la app: tokens que sigues, alertas que creas y posiciones que registras (precio de entrada, monto invertido, precio de venta).",
            )}
          </li>
          <li>{t("Notifications: the push-subscription identifier of each device where you enable alerts.", "Notificaciones: el identificador de suscripción push de cada dispositivo donde activas las alertas.")}</li>
          <li>{t("Preferences: your language and plan.", "Preferencias: tu idioma y tu plan.")}</li>
          <li>
            {t(
              "Payments (paid plans only): processed by Stripe. We never see or store your card number; we only keep a Stripe customer ID and your subscription status.",
              "Pagos (solo planes de pago): los procesa Stripe. Nunca vemos ni guardamos el número de tu tarjeta; solo conservamos un identificador de cliente de Stripe y el estado de tu suscripción.",
            )}
          </li>
          <li>{t("Technical logs: IP address and request data kept briefly for security and debugging.", "Registros técnicos: dirección IP y datos de las peticiones, conservados poco tiempo por seguridad y para corregir errores.")}</li>
        </ul>
        <p>
          {t(
            "We do not collect sensitive personal data, and we never ask for your wallet's private keys or seed phrase.",
            "No recabamos datos personales sensibles y nunca te pedimos las claves privadas ni la frase semilla de tu wallet.",
          )}
        </p>
      </Section>

      <Section title={t("2. Why we use it", "2. Para qué los usamos")}>
        <ul className={li}>
          <li>{t("To provide the Service: your account, watchlist, risk analysis, alerts and Profit Protection.", "Para prestar el Servicio: tu cuenta, watchlist, análisis de riesgo, alertas y Profit Protection.")}</li>
          <li>{t("To send the alerts and notifications you configure.", "Para enviarte las alertas y notificaciones que configuras.")}</li>
          <li>{t("To manage subscriptions and payments.", "Para gestionar suscripciones y pagos.")}</li>
          <li>{t("To provide support, keep the Service secure and fix problems.", "Para darte soporte, mantener la seguridad del Servicio y corregir problemas.")}</li>
        </ul>
        <p>
          {t(
            "We may use aggregated, anonymized statistics (for example, how often alerts were followed by a price drop) to improve the Service. We do not sell your data and do not use it for third-party advertising.",
            "Podemos usar estadísticas agregadas y anónimas (por ejemplo, con qué frecuencia una alerta fue seguida de una caída de precio) para mejorar el Servicio. No vendemos tus datos ni los usamos para publicidad de terceros.",
          )}
        </p>
      </Section>

      <Section title={t("3. Who processes it (transfers)", "3. Quién los trata (transferencias)")}>
        <p>
          {t(
            "We rely on these providers, some of which store data outside Mexico (mainly in the United States):",
            "Nos apoyamos en estos proveedores, algunos de los cuales almacenan datos fuera de México (principalmente en Estados Unidos):",
          )}
        </p>
        <ul className={li}>
          <li>{t("Supabase — database and authentication.", "Supabase — base de datos y autenticación.")}</li>
          <li>{t("Vercel — website hosting.", "Vercel — alojamiento de la web.")}</li>
          <li>{t("Stripe — payment processing.", "Stripe — procesamiento de pagos.")}</li>
          <li>
            {t(
              "Apple, Google, Microsoft and Mozilla push services — delivering notifications to your devices.",
              "Servicios push de Apple, Google, Microsoft y Mozilla — entrega de notificaciones a tus dispositivos.",
            )}
          </li>
        </ul>
        <p>
          {t(
            "These are processors acting on our behalf; transfers to them are necessary to provide the Service you requested, so under the LFPDPPP they don't require your separate consent.",
            "Son encargados que actúan por nuestra cuenta; estas transferencias son necesarias para prestarte el Servicio que solicitaste, por lo que conforme a la LFPDPPP no requieren tu consentimiento por separado.",
          )}
        </p>
      </Section>

      <Section title={t("4. Cookies", "4. Cookies")}>
        <p>
          {t(
            "We only use essential cookies: one to keep you signed in and one to remember your language. We don't use advertising or third-party tracking cookies.",
            "Solo usamos cookies esenciales: una para mantener tu sesión iniciada y otra para recordar tu idioma. No usamos cookies de publicidad ni de seguimiento de terceros.",
          )}
        </p>
        <p>
          {t(
            "We use Vercel Web Analytics to count page visits in aggregate (for example, which pages are visited and from which website people arrive). It doesn't use cookies and doesn't identify you personally.",
            "Usamos Vercel Web Analytics para contar las visitas de forma agregada (por ejemplo, qué páginas se visitan y desde qué sitio llega la gente). No usa cookies ni te identifica personalmente.",
          )}
        </p>
      </Section>

      <Section title={t("5. How long we keep it", "5. Cuánto tiempo los conservamos")}>
        <p>
          {t(
            "We keep your data while your account is active. If you ask us to delete your account, we delete your personal data within 30 days, except what we must keep by law (for example, billing records for tax purposes). Price history is market data, not personal data, and is deleted automatically after 8 days.",
            "Conservamos tus datos mientras tu cuenta esté activa. Si nos pides eliminar tu cuenta, borramos tus datos personales en un máximo de 30 días, salvo lo que debamos conservar por ley (por ejemplo, registros de facturación con fines fiscales). El historial de precios son datos de mercado, no personales, y se borra automáticamente a los 8 días.",
          )}
        </p>
      </Section>

      <Section title={t("6. Your rights (ARCO)", "6. Tus derechos (ARCO)")}>
        <p>
          {t(
            "You can request Access to your data, its Rectification, its Cancellation (deletion) or Oppose its use, and you can withdraw your consent, by writing to",
            "Puedes solicitar el Acceso a tus datos, su Rectificación, su Cancelación (eliminación) u Oponerte a su uso, así como revocar tu consentimiento, escribiendo a",
          )}{" "}
          <SupportContact />.{" "}
          {t(
            "Include your account email and what you're requesting. We'll reply within 20 business days, as the LFPDPPP requires.",
            "Indica el email de tu cuenta y lo que solicitas. Te responderemos en un plazo máximo de 20 días hábiles, como establece la LFPDPPP.",
          )}
        </p>
      </Section>

      <Section title={t("7. Security", "7. Seguridad")}>
        <p>
          {t(
            "Data is encrypted in transit (HTTPS), passwords are hashed, and each user can only access their own data. No system is 100% secure, but we take reasonable measures to protect your information.",
            "Los datos se cifran en tránsito (HTTPS), las contraseñas se guardan cifradas y cada usuario solo puede acceder a sus propios datos. Ningún sistema es 100 % seguro, pero tomamos medidas razonables para proteger tu información.",
          )}
        </p>
      </Section>

      <Section title={t("8. Changes", "8. Cambios")}>
        <p>
          {t(
            "We'll post any changes to this Privacy Policy on this page and notify you of material changes.",
            "Publicaremos cualquier cambio en este Aviso de privacidad en esta página y te avisaremos de los cambios importantes.",
          )}
        </p>
        <p>
          {t("Contact:", "Contacto:")} <SupportContact />
        </p>
      </Section>
    </LegalPage>
  );
}

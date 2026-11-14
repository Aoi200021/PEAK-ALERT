# PeakAlert

Plataforma SaaS para traders de memecoins: detecta **señales de posible agotamiento del impulso** (Peak Detection), envía **alertas explicadas** y ayuda a **proteger ganancias** (Profit Protection).

> PeakAlert es una herramienta de monitoreo. La puntuación de riesgo es un **modelo heurístico transparente**, no una IA entrenada ni una probabilidad. No predice máximos con certeza, no da asesoramiento financiero y **no ejecuta operaciones**.

---

## 1. Funcionalidades

| Módulo | Qué hace |
|---|---|
| **Peak Detection** | Puntuación 0–100 de riesgo de agotamiento a partir de 8 factores ponderados, cada uno con su valor y explicación. Si falta historial para un factor, se excluye y se informa la *cobertura*. Bandas: 0–30 saludable · 31–60 precaución · 61–80 elevado · 81–100 muy elevado. También calcula una puntuación de *momentum* para el ranking. |
| **Smart Alerts** | 10 tipos (ver §4). Se disparan una vez y se rearman con lógica anti-spam. Cada alerta incluye **qué pasa, por qué se generó, qué indicadores cambiaron, qué riesgo representa y qué vigilar**, además de una severidad. |
| **Profit Protection** | Entrada por precio **o** market cap, monto invertido. Muestra P&L, ROI, beneficio máximo no realizado, caída desde el máximo, % de beneficio devuelto y una **simulación de trailing stops** (10–50 %) sobre los precios observados. Incluye alertas de trailing stop y de retroceso de beneficio. |
| **Watchlist / Dashboard** | KPIs, resumen de mercado (SOL + tu watchlist), gráfica de precio y market cap, rankings de mayor riesgo y mayor momentum, alertas recientes y tabla con precio, variaciones, market cap, volumen, liquidez y riesgo. |
| **Paper Exit** | Qué habría pasado si hubieras vendido en cada alerta (1 h / 24 h / 7 d). |
| **Suscripciones** | Free / Pro ($5) / Premium ($10), página `/pricing` con comparación de planes y Stripe Checkout + Customer Portal + webhooks (**solo activos si configuras Stripe**). |
| **Demo pública** | `/demo` muestra Peak Detection con **datos reales** de DexScreener. Si la API no responde, muestra valores ficticios con un aviso grande de **DATOS DE DEMOSTRACIÓN**. |

### Factores de Peak Detection

| Factor | Peso | Fuente |
|---|---|---|
| Pérdida de momentum (ritmo de 1 h vs. media de 6 h) | 20 | DexScreener |
| Caída del volumen (1 h vs. promedio horario previo) | 15 | DexScreener |
| Presión de venta (ventas/compras en 5 min y 1 h) | 15 | DexScreener (nº de transacciones) |
| Caída desde el máximo reciente (6 h) | 15 | historial de PeakAlert |
| Subida previa extrema (6 h / 24 h) | 10 | DexScreener |
| Rechazos repetidos del máximo | 10 | historial de PeakAlert (≥ 1 h) |
| Caída de liquidez | 10 | historial de PeakAlert |
| Movimientos bruscos de market cap (5 min) | 5 | DexScreener |

Código: `src/lib/risk/score.ts` (funciones puras, con tests).

### Idiomas
La app es **bilingüe: inglés por defecto y español**.
- **Detección:** si el navegador está en español, se muestra en español; en cualquier otro idioma, en inglés. El selector **EN / ES** (cabecera pública, barra lateral y Ajustes) guarda la elección en la cookie `pa_locale`.
- **Alertas y notificaciones push:** se generan en el idioma de cada usuario (`profiles.locale`, que se sincroniza automáticamente con el idioma en que usa la app). Las alertas ya guardadas conservan el idioma con el que se crearon.
- **Textos de los factores de riesgo:** se guardan en ambos idiomas, porque un mismo token lo ven usuarios de los dos.
- **Código:** `src/lib/i18n` (`t("English", "Español")` en el cliente con `useI18n()`; `getLocale()` en el servidor).

## 2. Arquitectura

```
Navegador (Next.js client pages, SWR polling 30 s)
   │  /api/*  (cookie de sesión de Supabase)
   ▼
Next.js Route Handlers ── zod + límites del plan ──► Supabase Postgres (service role; RLS = solo lectura propia)
   │ refreshTokens()
   ├─► DexScreener (sin key)  ──fallback──► Birdeye (opcional, Solana)
   ├─► historial propio (snapshots ~1/min) ─► Peak Detection (riesgo + momentum)
   ├─► motor de alertas (puro) ─► alert_events (+explicación) + paper_exits
   ├─► picos de posiciones (Profit Protection)
   └─► Web Push (VAPID; urgencia alta para Premium y señales críticas)
Supabase pg_cron (cada minuto) ── POST /api/cron/refresh (Bearer CRON_SECRET)
Stripe ── webhook firmado ──► /api/billing/webhook ──► profiles.plan
```

Stack: Next.js 16 + TypeScript + Tailwind v4, Supabase (Auth + Postgres + RLS), DexScreener / Birdeye, Stripe, Web Push, Vercel. Se conservó todo lo de la v1.

**Por qué el cron va en Supabase:** Vercel Cron en el plan Hobby solo permite ejecuciones diarias.

**Seguridad:** ninguna clave secreta llega al navegador. Todas las escrituras pasan por la API (autenticación, validación zod y límites del plan). Las políticas RLS solo permiten **leer** filas propias, y el límite de tokens se aplica también por trigger en la base de datos. Las funciones de plan (desglose de factores, historial de señales, Profit Protection) se recortan **en el servidor**, no solo en la UI. Los webhooks de Stripe siempre verifican la firma.

## 3. Datos de mercado y limitaciones

- **DexScreener** (sin key): 300 req/min, hasta 30 direcciones por llamada y caché de unos 30 s. No ofrece histórico: PeakAlert guarda el suyo (8 días), así que "máximo", "rechazos", "caída de liquidez" y "media de 1 h" **empiezan a funcionar cuando el token empieza a monitorearse** (se necesitan minutos, o ≥ 1 h para los rechazos). La UI marca la cobertura parcial con `*`.
- Los picos que duren menos que el intervalo entre lecturas (~1 min) pueden no registrarse.
- La presión de venta usa el **número** de transacciones (DexScreener no separa el volumen por lado).
- El market cap de entrada se convierte a precio con la relación precio/market cap **actual** (supone que la supply no cambió).
- **Jupiter Tokens API** (`lite-api.jup.ag`, gratis y sin key) es la **fuente de respaldo para Solana**: cubre monedas de Pump.fun y otros launchpads todavía en la *bonding curve* que DexScreener no ha indexado. Se usa solo cuando DexScreener no tiene la moneda. Si una moneda existe pero **no tiene operaciones**, no tiene precio real y no se puede seguir; la app explica el motivo.
- **Entrada flexible:** se acepta la CA del token, la dirección del par (la de las URLs de DexScreener) o un enlace pegado (DexScreener, Pump.fun, Birdeye, GMGN, Jupiter, exploradores), en **cualquier red** que tenga DexScreener.
- **Birdeye** (opcional, `BIRDEYE_API_KEY`) solo se usa como respaldo para tokens de Solana sin datos en DexScreener. ⚠️ **No está verificado contra la API real** (no había key en el entorno de desarrollo); el parseo es tolerante y los campos que faltan quedan vacíos.
- Nunca se inventan datos: los valores ausentes se muestran como "—". La única excepción es la demo sin conexión, que se etiqueta como datos de demostración.

## 4. Alertas

| Tipo | Condición | Plan |
|---|---|---|
| Caída desde el máximo | −X % desde el máximo registrado (opcional: solo si el market cap máximo superó Y) | Free+ |
| Movimiento brusco | ±X % en 5 min / 1 h | Free+ |
| Caída del volumen | volumen 1 h vs. promedio de las 5 h previas | Free+ |
| Riesgo de agotamiento | puntuación ≥ X, con cobertura mínima; histéresis de 10 puntos | Pro+ |
| Pérdida de momentum | +X % en 6 h, −Y % en 1 h, ventas ≥ Z × compras | Pro+ |
| Ruptura de tendencia | precio X % bajo su media de 1 h tras subir en 6 h | Pro+ |
| Movimiento anormal de liquidez | liquidez −X % en 1 h / 6 h | Pro+ |
| Cruce de market cap | cruza por encima/debajo de un nivel | Pro+ |
| Trailing stop (posición) | −X % desde el máximo desde tu entrada | Pro+ |
| Retroceso de beneficio (posición) | devolver X % del beneficio máximo tras +Y % | Pro+ |

Anti-spam: se dispara una vez y se rearma cuando la condición desaparece (o con un nuevo máximo en las alertas basadas en picos); cooldown de 60 min (configurable en Premium); bloqueo optimista contra duplicados. No se evalúa con datos de más de 10 min. Los textos nunca afirman que el precio *va a* caer ni recomiendan vender.

## 5. Planes

| | Free | Pro $5/mes | Premium $10/mes |
|---|---|---|---|
| Tokens | 3 | 25 | 100 |
| Puntuación de riesgo | ✓ | ✓ | ✓ |
| Desglose de factores | — | ✓ | ✓ |
| Alertas | básicas | todas | todas |
| Profit Protection | — | ✓ | ✓ |
| Historial de alertas | 24 h | 7 días | completo |
| Historial de señales (gráfica de riesgo) | — | — | ✓ |
| Alertas prioritarias (push urgencia alta) | — | — | ✓ |
| Analíticas de efectividad | — | — | ✓ |
| Cooldown configurable | — | — | ✓ |

Definición única: `src/lib/plans.ts`. El límite de tokens está duplicado en `plan_token_limit()` (SQL).

## 6. Configuración paso a paso

### 6.1 Supabase
1. Crea un proyecto en <https://supabase.com/dashboard>.
2. **SQL Editor** → ejecuta **en orden** `supabase/migrations/0001_init.sql`, `0002_peak_detection.sql` y `0003_locale.sql`. Todos se pueden volver a ejecutar sin problema.
   *Si ya tenías una versión anterior desplegada, ejecuta solo las migraciones que te falten.*
3. **Project Settings → API Keys**: copia la *Publishable key* y la *Secret key*. La URL está en **Data API**.
4. **Authentication → URL Configuration**: *Site URL* = tu dominio. En *Redirect URLs* añade `https://TU-DOMINIO/auth/callback` (y `http://localhost:3000/auth/callback`).
5. Para usuarios reales configura un SMTP propio (**Authentication → Emails**). El SMTP incluido tiene un límite muy bajo.

### 6.2 Variables de entorno
```bash
cp .env.example .env.local
openssl rand -hex 32                 # → CRON_SECRET
npx web-push generate-vapid-keys     # → NEXT_PUBLIC_VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY
```

| Variable | Obligatoria | Dónde conseguirla |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | Sí | Supabase |
| `CRON_SECRET` | Sí | `openssl rand -hex 32` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Para push | `npx web-push generate-vapid-keys`; subject = `mailto:tu@email` |
| `BIRDEYE_API_KEY` | No | <https://bds.birdeye.so> → API key |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_PREMIUM` | Para cobrar | Ver 6.5 |

### 6.3 Local
```bash
npm install
npm run dev          # http://localhost:3000
npm test             # 45 tests unitarios
npm run test:live    # tests contra DexScreener real
```

### 6.4 Vercel + job
1. Importa el repo en Vercel, añade las variables y despliega.
   - Con el repo conectado (Vercel → Settings → Git), **cada push a la rama de producción se publica solo**. La rama se configura en Settings → Environments → Production → Branch Tracking.
   - En el plan Hobby, Vercel puede bloquear despliegues automáticos de repos **privados** si el autor del commit no es el dueño de la cuenta. Soluciones: hacer público el repo o publicar con la CLI (`npx vercel deploy --prod`).
2. En Supabase → SQL Editor ejecuta `supabase/cron.sql`, reemplazando antes `<APP_URL>` y `<CRON_SECRET>`.
3. Comprueba: `select status_code, content from net._http_response order by created desc limit 5;` debe devolver 200.

### 6.5 Stripe (activar cobros)
1. En Stripe → **Product catalog**: crea "PeakAlert Pro" con precio recurrente de **$5/mes** y "PeakAlert Premium" con **$10/mes**. Copia los `price_...` en `STRIPE_PRICE_PRO` y `STRIPE_PRICE_PREMIUM`.
2. **Developers → API keys** → `STRIPE_SECRET_KEY` (usa primero `sk_test_...`).
3. **Developers → Webhooks** → endpoint `https://TU-DOMINIO/api/billing/webhook` con los eventos `checkout.session.completed` y `customer.subscription.created`, `.updated` y `.deleted`. Copia el *signing secret* en `STRIPE_WEBHOOK_SECRET`.
4. **Settings → Billing → Customer portal**: actívalo y permite cambiar de plan y cancelar.
5. Vuelve a desplegar. `/pricing` mostrará los botones de pago. Prueba con la tarjeta `4242 4242 4242 4242`.

Sin estas cuatro variables, los pagos están **desactivados**: los botones dicen "Próximamente" y las rutas responden 501.

Mientras no actives Stripe, puedes cambiar el plan de un usuario a mano:
```sql
update public.profiles set plan = 'pro' where email = 'usuario@ejemplo.com';
```

## 7. Estado: qué está verificado y qué no

**Verificado en este entorno:**
- 45 tests unitarios (incluida la detección de idioma y las alertas en inglés y español): motor de riesgo, los 10 tipos de alerta y sus explicaciones, anti-spam, simulación de trailing stops, Profit Protection, Paper Exit, contexto de historial y lógica de Stripe (mapeo de planes, sincronización y verificación de firmas de webhook).
- 4 tests contra la API real de DexScreener. La demo pública se probó con datos en vivo.
- Las migraciones se probaron en Postgres 16: instalación limpia, actualización desde la v1 y doble ejecución.
- `next build`, `tsc` y `eslint` sin errores.
- La UI se revisó con Playwright en escritorio y móvil, con la API simulada.

**No verificado** (no había cuentas ni claves en este entorno): el flujo completo contra un Supabase real (auth, PostgREST, pg_cron), la entrega real de push, Stripe en vivo (Checkout, Portal, webhooks reales) y Birdeye.

**Pendiente:** notificaciones por email/Telegram (la interfaz de canales ya existe), ventas parciales, recuperación de contraseña (hay enlace mágico como alternativa) y límites de rate por usuario en la API.

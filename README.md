# PeakAlert

Monitor de memecoins con alertas configurables: caída desde el máximo, caída de volumen, pérdida de momentum, cruces de market cap y movimientos bruscos. Incluye un portfolio tracker y **Paper Exit** para medir si las alertas habrían servido.

> PeakAlert es una herramienta de monitoreo. No predice máximos, no da asesoramiento financiero y **no ejecuta operaciones**.

---

## 1. Arquitectura

```
Navegador (Next.js client pages, SWR polling 30 s)
   │  fetch /api/*  (cookie de sesión de Supabase)
   ▼
Next.js Route Handlers  ── valida input (zod) + plan ──►  Supabase Postgres (service role)
   │                                                     ▲   RLS: el usuario solo puede LEER lo suyo
   │  refreshTokens()                                    │
   ├─► DexScreener API (sin key)                         │
   ├─► motor de alertas (funciones puras)  ──► alert_events + paper_exits
   └─► Web Push (VAPID)                                  │
                                                         │
Supabase pg_cron (cada minuto) ──POST /api/cron/refresh──┘  (Bearer CRON_SECRET)
```

| Capa | Tecnología | Por qué |
|---|---|---|
| Frontend | Next.js 16 (App Router) + TypeScript + Tailwind v4 | Lo pediste; un solo repo para UI y API |
| Gráficas | TradingView Lightweight Charts (Apache-2.0, muestra el logo de atribución) + sparklines SVG | Estética de terminal, ligera |
| Auth + DB | Supabase (email/contraseña + enlace mágico, Postgres con RLS) | Lo pediste; adecuado |
| Datos | DexScreener API pública | Cubre Solana/EVM, sin API key |
| Job | **Supabase pg_cron + pg_net** → `/api/cron/refresh` | Ver nota abajo |
| Hosting | Vercel | Lo pediste; adecuado |
| Notificaciones | Web Push estándar (librería `web-push`, service worker `public/sw.js`) | Funciona en escritorio y Android; iOS 16.4+ si la app se instala |

**Cambio respecto a tu propuesta — el cron:** Vercel Cron en el plan Hobby solo permite ejecuciones **diarias**, lo cual no sirve para alertas. Por eso el job programado vive en Supabase (`pg_cron`, gratis), que llama a la API cada minuto. Si usas Vercel Pro, también puedes usar Vercel Cron.

**Seguridad:**
- Ninguna clave secreta llega al navegador. Solo `NEXT_PUBLIC_SUPABASE_URL`, la publishable key y la clave pública VAPID son públicas (están diseñadas para eso).
- Todas las escrituras pasan por API routes que autentican al usuario, validan con zod y aplican los límites del plan; luego escriben con la service key. Las políticas RLS solo permiten **leer** filas propias, así un usuario no puede saltarse los límites llamando a Supabase directamente.
- El límite de tokens por plan también se aplica en la base de datos (trigger con lock por usuario).
- El endpoint del cron compara el secreto en tiempo constante.

## 2. API de mercado y sus limitaciones

**DexScreener** (`https://api.dexscreener.com`, sin key):
- `GET /latest/dex/tokens/{address}` — búsqueda en todas las redes (se usa al agregar un token).
- `GET /tokens/v1/{chain}/{a1,a2,…}` — hasta **30 direcciones** por llamada (se usa para refrescar).
- Límite: **300 req/min**. Respuestas cacheadas ~30 s en su CDN → PeakAlert no refresca un token más de una vez cada 30 s.
- **No hay histórico/OHLC.** Por eso PeakAlert guarda sus propios *snapshots* (≈1/min) y:
  - el "máximo" es el **máximo observado por PeakAlert** desde que sigue el token (no el ATH real);
  - un pico que dure menos que el intervalo entre lecturas puede no registrarse;
  - las gráficas empiezan cuando empiezas a seguir el token.
- `marketCap`, `fdv` o liquidez pueden faltar: se muestran como "—", nunca se inventan.
- Se toma el par con **más liquidez** donde el token es el *base token*. En tokens con liquidez muy baja el precio puede ser poco fiable (la UI lo advierte).
- Si DexScreener falla, se conservan los últimos datos válidos, se marca el error y la UI muestra la antigüedad de los datos. **El motor nunca evalúa alertas con datos de más de 10 minutos.**

## 3. Estructura

```
supabase/
  migrations/0001_init.sql   esquema, RLS, triggers, funciones (idempotente)
  cron.sql                   job cada minuto (pg_cron + pg_net + Vault)
public/sw.js                 service worker (solo push)
src/
  proxy.ts                   refresca la sesión y protege rutas (antes "middleware")
  app/
    page.tsx                 landing
    login/ signup/ auth/callback/
    (app)/dashboard|tokens/[id]|alerts|portfolio|analytics|settings
    api/
      watchlist/  tokens/lookup  tokens/[id]
      alerts/rules  alerts/events  alerts/events/read
      positions/  push/subscribe  push/test  me/  analytics/
      cron/refresh/              job de fondo
      billing/checkout|webhook   preparados, devuelven 501
  components/                UI (sin librería de componentes)
  lib/
    alerts/engine.ts         motor de alertas puro (+ tests)
    market/dexscreener.ts    cliente con timeout, reintentos y validación
    market/refresh.ts        refresco → snapshots → alertas → paper exit → push
    notifications/           canales (Web Push implementado)
    plans.ts                 límites y funciones por plan
    billing/                 estructura para Stripe (no activa)
    paper-exit.ts portfolio.ts format.ts validation.ts
```

## 4. Cómo funcionan las alertas

Todas son *edge-triggered* para no repetir avisos: se disparan una vez, se desarman y se **rearman** cuando la condición desaparece (o, en la caída desde máximo, cuando se marca un **nuevo máximo**). Además hay un cooldown (60 min; configurable en Premium). Un bloqueo optimista (`version`) evita duplicados si dos procesos evalúan a la vez.

| Tipo | Condición | Plan |
|---|---|---|
| Caída desde el máximo | precio ≤ máximo registrado − X %. Opcional: solo si el market cap máximo superó Y (p. ej. "si llega a $1M y cae 15 %") | Free+ |
| Movimiento brusco | variación 5 min o 1 h ≥ X % (sube, baja o ambas) | Free+ |
| Caída del volumen | volumen 1 h vs. promedio horario de las 5 h previas ((vol6h − vol1h)/5) | Pro+ |
| Pérdida de momentum | heurística: +X % en 6 h, −Y % en 1 h y ventas ≥ Z × compras en 1 h | Pro+ |
| Cruce de market cap | cruza por encima/debajo de un valor (no se dispara si ya estaba del otro lado al crearla) | Pro+ |

Se evalúan cada vez que se refresca un token: cada minuto con el cron, y cada 30 s mientras alguien tiene el dashboard abierto.

**Paper Exit:** al dispararse una alerta se guarda el precio. Luego se registran el primer precio observado tras 1 h, 24 h y 7 d, más el máximo y mínimo posteriores. Si tenías una posición abierta se calcula también la diferencia en USD.

## 5. Configuración paso a paso

### 5.1 Supabase
1. Crea un proyecto en <https://supabase.com/dashboard>.
2. **SQL Editor → New query**, pega todo `supabase/migrations/0001_init.sql` y pulsa **Run**.
3. **Project Settings → API Keys**: copia la *Publishable key* y la *Secret key* (o las legacy *anon* y *service_role*). La URL está en **Project Settings → Data API**.
4. **Authentication → URL Configuration**:
   - *Site URL*: `http://localhost:3000` en desarrollo (luego tu dominio de Vercel).
   - *Redirect URLs*: añade `http://localhost:3000/auth/callback` y `https://TU-DOMINIO/auth/callback`.
5. (Opcional) **Authentication → Providers → Email**: puedes desactivar "Confirm email" para pruebas rápidas.
   El SMTP incluido en Supabase tiene un límite muy bajo de emails por hora; para usuarios reales configura un SMTP propio (Resend, Postmark…).

### 5.2 Variables de entorno
```bash
cp .env.example .env.local
openssl rand -hex 32                 # → CRON_SECRET
npx web-push generate-vapid-keys     # → NEXT_PUBLIC_VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY
```
Rellena `.env.local`. `VAPID_SUBJECT` debe ser `mailto:tu@email.com` o una URL tuya.

### 5.3 Ejecutar en local
```bash
npm install
npm run dev          # http://localhost:3000
npm test             # tests unitarios
npm run test:live    # tests contra la API real de DexScreener
```

### 5.4 Desplegar en Vercel
1. Importa el repo en <https://vercel.com/new>.
2. **Settings → Environment Variables**: añade todas las de `.env.local` (Production y Preview).
3. Deploy. Actualiza *Site URL* y *Redirect URLs* en Supabase con tu dominio.
   Las variables `NEXT_PUBLIC_*` se incrustan al compilar: si las cambias, vuelve a desplegar.

### 5.5 Activar el job de fondo
En Supabase → SQL Editor, abre `supabase/cron.sql`, reemplaza `<APP_URL>` y `<CRON_SECRET>` y ejecútalo. Comprueba:
```sql
select status_code, content from net._http_response order by created desc limit 5;
```
Debe devolver `200` con `{"ok":true,…}`. Prueba manual:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://TU-DOMINIO/api/cron/refresh
```

### 5.6 Cambiar el plan de un usuario (mientras no hay pagos)
```sql
update public.profiles set plan = 'pro' where email = 'usuario@ejemplo.com';   -- 'free' | 'pro' | 'premium'
```

## 6. Monetización / Stripe — preparado, no implementado
Ya existe: columna `profiles.plan` y columnas `stripe_*`, límites aplicados en servidor y BD, `applySubscription()` (mapea un Price ID a un plan), y rutas `/api/billing/checkout` y `/api/billing/webhook` que hoy responden **501**. No hay precios definidos.

Para activarlo: `npm i stripe` → crea los productos y precios en Stripe → define `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_PREMIUM` → implementa la creación de la Checkout Session y la verificación de firma del webhook (que llama a `applySubscription`) → añade el enlace al Customer Portal en Ajustes.

## 7. Estado: qué funciona y qué no

**Implementado y probado:**
- Motor de alertas, P&L, Paper Exit y formateo: 17 tests unitarios.
- Cliente de DexScreener contra la API real: 4 tests (`npm run test:live`).
- Migración SQL probada en Postgres 16 (con un stub del esquema `auth`): idempotente, límite de plan por trigger, aislamiento RLS y permisos de funciones.
- `next build`, `tsc` y `eslint` sin errores.
- Interfaz revisada con Playwright en escritorio y móvil (con la API simulada).
- Cifrado Web Push con VAPID verificado localmente.

**No verificado en este entorno** (no había un proyecto Supabase): el flujo completo contra un Supabase real (registro, emails, PostgREST, `pg_cron`) y la entrega real de push a un navegador. Haz una prueba de punta a punta tras configurarlo (sección 5).

**No implementado todavía:** pagos con Stripe, notificaciones por email/Telegram (la interfaz de canales está lista en `src/lib/notifications`), venta parcial de posiciones, recuperación de contraseña (hay enlace mágico como alternativa), límites de rate por usuario en la API.

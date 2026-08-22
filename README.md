# LA NUTRIA APP

PWA para registrar los gastos de casa. Offline-first, sin framework ni build step.

## Stack

- **Frontend:** HTML/CSS/JS vanilla, instalable (manifest + Service Worker), cola offline en IndexedDB.
- **Backend:** Supabase — Postgres + Edge Functions (Deno/TypeScript).
- **Boletas:** Google Drive con OAuth de usuario (scope `drive.file`, refresh token en la base).

## Base de datos

| tabla | qué guarda |
|---|---|
| `usuarios` | Tomás (60%) y Renata (40%) |
| `categorias` | Supermercado, Comida, Hogar, Transporte, Servicios, Otros |
| `gastos` | el gasto, con `periodo` (YYYY-MM) generado y el estado de subida a Drive |
| `gasto_participaciones` | el reparto de cada gasto, materializado por trigger |
| `liquidaciones` | pagos entre ellos para saldar cuentas |
| `configuracion` | singleton con los IDs de Drive y del Sheet |

Vistas: `v_balance` (saldo neto por persona), `v_resumen_mensual`, `v_resumen_periodo`,
`v_gastos_detalle`.

El reparto se llena solo según `reparto_tipo`: `default` (60/40), `igual` (50/50),
`personal` (100% del pagador) o `custom` (porcentajes explícitos del cliente).

## Migraciones

En `supabase/migrations/`, aplicadas en orden numérico. Ya están aplicadas en el
proyecto `la-nutria-app`.

## Configuración

Secretos que viven en Supabase (Settings → Edge Functions → Secrets), nunca en el cliente:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`

El `refresh_token` se guarda en `configuracion.google_refresh_token` al abrir una
sola vez la función `google-oauth`; esa tabla no tiene políticas de RLS, así que
solo la ve el service role.

### Por qué OAuth y no una service account

Google no permite que una service account escriba archivos en "Mi unidad": no
tiene cuota propia y el archivo quedaría a su nombre (`storageQuotaExceeded`).
Funciona solo contra Unidades compartidas, que requieren Workspace. Con OAuth de
usuario los archivos son del dueño de la cuenta y usan su espacio.

El scope es `drive.file`, que da acceso únicamente a lo que la app crea — nunca
al resto del Drive. Por eso la app crea su propia carpeta `LA NUTRIA APP` en vez
de usar una compartida a mano.

## Edge Functions

| función | qué hace |
|---|---|
| `gasto-guardar` | registra el gasto (idempotente por `client_uuid`) y deja la foto en Storage |
| `gasto-a-drive` | sube la boleta a la carpeta del mes y refresca el Sheet |
| `sheet-sync` | vuelca todos los gastos al Google Sheet |
| `drive-reintentos` | reintenta las boletas que quedaron pendientes o en error |
| `google-oauth` | conecta la cuenta de Google una sola vez |

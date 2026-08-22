# LA NUTRIA APP

PWA para registrar los gastos de casa. Offline-first, sin framework ni build step.

## Stack

- **Frontend:** HTML/CSS/JS vanilla, instalable (manifest + Service Worker), cola offline en IndexedDB.
- **Backend:** Supabase — Postgres + Edge Functions (Deno/TypeScript).
- **Boletas:** Google Drive vía service account (JWT RS256 firmado dentro de la Edge Function).

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

- `GOOGLE_SA_KEY` — el JSON completo de la service account de Google.

La carpeta raíz de Drive se guarda en `configuracion.drive_parent_id`.


# Andflow CRM (Monorepo) · Frontend + Backend MySQL

- `apps/frontend` → React + Vite (Tailwind), UI minimal con theming y Maestra ampliada.
- `apps/backend`  → Express + MySQL (auto-crea DB y tablas), endpoints de configuración Shopify.
- `docker-compose.yml` → MySQL local listo.

## Requisitos
- Node 18+
- Docker (opcional pero recomendado: levanta MySQL automáticamente)

## Dev
```bash
npm i
npm run dev
```
- Frontend: http://localhost:5173
- Backend:  http://localhost:5100/api/health

> El script `predev` intenta `docker compose up -d`. Si no tienes Docker, configura un MySQL propio y ajusta `.env` en `apps/backend`.

## Producción
- Arranca MySQL y define las variables `MYSQL_*` + `SECRET_KEY`.
- `npm run build && npm run start` (sirve sólo el backend). Frontend lo despliegas como estático desde `apps/frontend/dist`.

## Endpoints backend
- `GET /api/health`
- `POST /api/config/shopify` → `{ domain, token }`
- `GET /api/config/shopify` → `{ configured, domain, hasToken, savedAt }`
- `DELETE /api/config/shopify`

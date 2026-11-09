# Deployment

## Supabase (новый проект `vochko-pvp`)

1. Создать проект в https://supabase.com/dashboard (New project).
2. Включить анонимную аутентификацию: **Authentication → Sign In / Providers →
   Anonymous → Enable**.
3. Применить миграции (SQL editor или CLI):
   - `supabase/migrations/0001_pvp_schema.sql`
   - `supabase/migrations/0002_pvp_maintenance.sql`
4. Deploy Edge Functions (CLI или MCP):
   ```
   supabase functions deploy create-room join-room get-state submit-turn rematch leave-room
   ```
5. Секреты:
   ```
   supabase secrets set SUPABASE_DB_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres"
   ```
   (`SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY` инжектятся автоматически.)

## GitHub Pages

1. Репозиторий на GitHub; Settings → Pages → Source: GitHub Actions.
2. Actions workflow (этап E): `npm ci && npm run build` → deploy `dist/`.
3. `vite.config.js`: `base = '/<repo-name>/'`.
4. Secrets репозитория: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` —
   только публичные значения.

## Приглашение

Ссылка комнаты: `https://<user>.github.io/<repo>/?room=<CODE>` — клиент при
загрузке читает `room` и предлагает «Присоединиться».

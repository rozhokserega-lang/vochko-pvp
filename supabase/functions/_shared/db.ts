// Транзакционное подключение к Postgres (service-role). Нужен секрет
// SUPABASE_DB_URL — строка pooler-подключения из настроек проекта.
import postgres from 'npm:postgres@3';

export const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, {
  max: 1,
  idle_timeout: 5,
  prepare: false, // требуется для Supabase pooler (transaction mode)
});

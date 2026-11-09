// Аутентификация по проверенному JWT (README §4: идентификатор пользователя
// берётся из токена, никогда из тела запроса).
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { HttpError } from './cors.ts';

export function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

export async function requireUser(req: Request): Promise<{ id: string }> {
  const header = req.headers.get('Authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError('unauthorized', 401);
  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data.user) throw new HttpError('unauthorized', 401);
  return { id: data.user.id };
}

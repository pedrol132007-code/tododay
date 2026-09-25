// Prepara o Supabase de DEV para os testes de ponta a ponta: conta de teste confirmada, uma
// equipe com ela como admin e um board vazio. Idempotente: roda antes de cada `npm run test:e2e`
// e apaga o conteúdo do board, então cada execução começa do zero.
//
// Lê do .env: SUPABASE_DB_URL (conexão Postgres do projeto de dev), VITE_SUPABASE_URL,
// E2E_EMAIL e E2E_PASSWORD. Recusa rodar se o banco não for o mesmo projeto do app.
import fs from "node:fs";
import pg from "pg";

export const TEAM_NAME = "Equipe E2E";
export const BOARD_NAME = "Board E2E";

export function readEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^"(.*)"$/, "$1");
  }
  for (const key of ["SUPABASE_DB_URL", "VITE_SUPABASE_URL", "E2E_EMAIL", "E2E_PASSWORD"]) {
    if (!env[key]) throw new Error(`.env sem ${key} (ver .env.example)`);
  }
  return env;
}

const projectRef = (url: string) => url.match(/(?:postgres\.|db\.|https:\/\/)([a-z0-9]{20})/)?.[1];

export default async function seed() {
  const env = readEnv();
  const appRef = projectRef(env.VITE_SUPABASE_URL);
  if (!appRef || appRef !== projectRef(env.SUPABASE_DB_URL)) {
    throw new Error("SUPABASE_DB_URL e VITE_SUPABASE_URL apontam para projetos diferentes; seed cancelado.");
  }

  const client = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      `Não foi possível conectar com SUPABASE_DB_URL (${(error as Error).message}). ` +
        "Copie a connection string atual em Project Settings → Database, ou redefina a senha do banco lá.",
    );
  }
  try {
    await client.query("begin");
    const { rows } = await client.query(
      `
      with existing as (select id from auth.users where email = $1),
      created as (
        insert into auth.users (
          instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
          confirmation_token, recovery_token, email_change_token_new, email_change
        )
        select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
               $1, extensions.crypt($2, extensions.gen_salt('bf')), now(),
               '{"provider":"email","providers":["email"]}', '{"display_name":"Teste E2E"}', now(), now(),
               '', '', '', ''
        where not exists (select 1 from existing)
        returning id
      )
      select id from created union all select id from existing
      `,
      [env.E2E_EMAIL, env.E2E_PASSWORD],
    );
    const userId: string = rows[0].id;

    // Mantém a senha do .env mesmo se ela mudou desde a última execução.
    await client.query(
      "update auth.users set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf')), email_confirmed_at = coalesce(email_confirmed_at, now()) where id = $1",
      [userId, env.E2E_PASSWORD],
    );
    await client.query(
      `insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
       values ($1::text, $1::uuid, jsonb_build_object('sub', $1::text, 'email', $2::text, 'email_verified', true), 'email', now(), now(), now())
       on conflict (provider_id, provider) do nothing`,
      [userId, env.E2E_EMAIL],
    );

    let team = await client.query("select id from public.team where name = $1 and created_by = $2", [TEAM_NAME, userId]);
    if (team.rowCount === 0) {
      team = await client.query("insert into public.team (name, created_by) values ($1, $2) returning id", [TEAM_NAME, userId]);
    }
    const teamId = team.rows[0].id;
    await client.query(
      `insert into public.team_member (team_id, user_id, role, job_title) values ($1, $2, 'admin', 'Robô de testes')
       on conflict (team_id, user_id) do update set role = 'admin'`,
      [teamId, userId],
    );

    let board = await client.query("select id from public.board where team_id = $1 and name = $2", [teamId, BOARD_NAME]);
    if (board.rowCount === 0) {
      board = await client.query("insert into public.board (team_id, name, position) values ($1, $2, 1) returning id", [teamId, BOARD_NAME]);
    }
    await client.query("delete from public.list where board_id = $1", [board.rows[0].id]);
    await client.query("delete from public.label where board_id = $1", [board.rows[0].id]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

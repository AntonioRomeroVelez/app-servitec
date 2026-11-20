// Levanta el Supabase local y aplica las migraciones pendientes (npm run supabase:local).
import { execFileSync, spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const migraciones = join(aqui, '..', 'migrations')
const dc = (args, opciones = {}) =>
  spawnSync('docker', ['compose', '-f', join(aqui, 'docker-compose.yml'), '--env-file', join(aqui, '.env'), ...args], { encoding: 'utf8', ...opciones })
const psql = (sql) => dc(['exec', '-T', 'db', 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt'], { input: sql })

execFileSync('node', [join(aqui, 'generar-claves.mjs')], { stdio: 'inherit' })
const arranque = dc(['up', '-d', '--wait', 'db', 'auth', 'rest', 'api'])
if (arranque.status !== 0) {
  console.error(arranque.stdout, arranque.stderr)
  process.exit(1)
}

// Espera a que GoTrue haya creado auth.users
for (let i = 0; i < 40; i++) {
  if (psql("select to_regclass('auth.users') is not null").stdout.trim() === 't') break
  await new Promise((r) => setTimeout(r, 1500))
}
psql('create table if not exists public.migraciones_aplicadas (nombre text primary key, aplicada timestamptz default now())')
for (const f of readdirSync(migraciones).filter((n) => n.endsWith('.sql')).sort()) {
  if (psql(`select 1 from public.migraciones_aplicadas where nombre = '${f}'`).stdout.trim() === '1') continue
  const r = psql(readFileSync(join(migraciones, f), 'utf8') + `\ninsert into public.migraciones_aplicadas (nombre) values ('${f}');`)
  if (r.status !== 0) {
    console.error(`Falló ${f}:\n`, r.stderr)
    process.exit(1)
  }
  console.log(`Migración aplicada: ${f}`)
}
dc(['kill', '-s', 'SIGUSR1', 'rest']) // PostgREST recarga el esquema
const env = Object.fromEntries(
  readFileSync(join(aqui, '.env'), 'utf8').split('\n').filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)),
)
console.log(`\nSupabase local listo en http://localhost:${env.PUERTO_API}`)
console.log(`  VITE_SUPABASE_URL=http://localhost:${env.PUERTO_API}`)
console.log(`  VITE_SUPABASE_ANON_KEY=${env.ANON_KEY}`)

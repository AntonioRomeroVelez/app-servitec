// Genera supabase/local/.env con un secreto JWT aleatorio y las claves anon y service_role firmadas (HS256).
// Es solo para desarrollo local; el archivo .env está en .gitignore y nunca se sube.
import { createHmac, randomBytes } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const destino = join(dirname(fileURLToPath(import.meta.url)), '.env')
if (existsSync(destino)) {
  console.log('Ya existe supabase/local/.env; no se sobrescribe.')
  process.exit(0)
}
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const firmar = (rol, secreto) => {
  const cuerpo = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ role: rol, iss: 'servitec-local', iat: 1700000000, exp: 2000000000 })}`
  return `${cuerpo}.${createHmac('sha256', secreto).update(cuerpo).digest('base64url')}`
}
const secreto = randomBytes(32).toString('hex')
const clavePg = randomBytes(12).toString('hex')
writeFileSync(
  destino,
  [
    `POSTGRES_PASSWORD=${clavePg}`,
    `JWT_SECRET=${secreto}`,
    `ANON_KEY=${firmar('anon', secreto)}`,
    `SERVICE_ROLE_KEY=${firmar('service_role', secreto)}`,
    'PUERTO_API=55321',
    'PUERTO_DB=55322',
    '',
  ].join('\n'),
)
console.log('Creado supabase/local/.env')

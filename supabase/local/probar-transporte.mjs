// Prueba el transporte de Supabase (src/supabase/transporte.js) contra el Supabase local: el mismo contrato que usa la app.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crearTransporte } from '../../src/supabase/transporte.js'
import { prepararPlataforma, crearEmpresaConAdmin } from './ayudas.mjs'

const env = Object.fromEntries(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '.env'), 'utf8').split('\n').filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)))
const memoria = () => {
  const m = new Map()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }
}
const nuevo = () => crearTransporte({ url: `http://localhost:${env.PUERTO_API}`, anonKey: env.ANON_KEY, storage: memoria() })

let fallos = 0
const ok = (c, m, extra) => (c ? console.log('OK:', m) : (fallos++, console.log('FALLO:', m, extra ?? '')))
const rechaza = async (fn, msg, patron) => {
  try {
    await fn()
    ok(false, `${msg} (no falló)`)
  } catch (e) {
    ok(patron.test(e.message) || patron.test(e.code), `${msg} -> "${e.message}"`)
  }
}
const sufijo = Date.now()
const A = nuevo()
const B = nuevo()
const T = nuevo()
const P = nuevo()
const claveA = 'ClaveSegura123'

// --- la plataforma crea dos empresas (no hay registro abierto) y sus administradores entran
await prepararPlataforma(P, sufijo)
const ea = await crearEmpresaConAdmin(P, A, { empresa: 'Empresa A', usuario: 'ana', nombre: 'Ana Admin', correo: `ana${sufijo}@a.com`, clave: claveA, datos: { ruc: '1790000000001', telefono: '022222222', subtitulo: 'Seguridad' } })
ok(ea.sesion.usuario.rol === 'superadmin' && ea.sesion.token && ea.sesion.usuario.plataforma === false, 'empresas_create crea la empresa y su administrador (superadmin de esa empresa)')
const eb = await crearEmpresaConAdmin(P, B, { empresa: 'Empresa B', usuario: 'beto', nombre: 'Beto', correo: `beto${sufijo}@b.com`, clave: claveA })
ok((await A.call('configuracion_get')).empresa.nombre === 'Empresa A' && (await A.call('configuracion_get')).empresa.ruc === '1790000000001', 'los datos de la empresa quedaron en su configuración')
await rechaza(() => A.call('empresas_list'), 'el administrador de una empresa no gestiona empresas', /permisos/)
await rechaza(() => A.cliente.rpc('registrar_empresa', { p_empresa: 'X', p_nombre: 'x', p_usuario: 'xxx' }).then(({ error }) => { if (error) throw new Error(error.message) }), 'el registro abierto está cerrado', /permission|permiso/i)
const empresasLista = await P.call('empresas_list')
ok([ea.id, eb.id].every((id) => empresasLista.some((e) => e.id === id)) && empresasLista.find((e) => e.id === ea.id).usuarios === 1, 'empresas_list muestra las empresas y su número de usuarios')
await rechaza(() => P.call('empresas_create', { data: { nombre: 'Sin admin', admin: { usuario: 'zz', nombre: 'Z', correo: 'z@z.com', clave: 'ClaveSegura123' } } }), 'usuario del administrador inválido', /inválido/)
await rechaza(() => P.call('empresas_create', { data: { nombre: 'Repetida', admin: { usuario: 'ana', nombre: 'Otra', correo: `ana${sufijo}@a.com`, clave: 'ClaveSegura123' } } }), 'correo ya registrado', /ya está registrado/)
const idA = ea.id
await P.call('empresas_update', { id: idA, data: { plan: 'pro', datos: { direccion: 'Av. Principal 123' } } })
const edit = (await P.call('empresas_list')).find((e) => e.id === idA)
ok(edit.plan === 'pro' && edit.datos.direccion === 'Av. Principal 123' && edit.datos.ruc === '1790000000001', 'empresas_update cambia plan y datos sin perder los demás')
await rechaza(() => A.call('login', { usuario: `ana${sufijo}@a.com`, clave: 'mala' }), 'login con clave mala', /incorrectos/)
ok((await A.call('login', { usuario: `ana${sufijo}@a.com`, clave: claveA })).usuario.usuario === 'ana', 'login correcto')

// --- usuarios: el superadmin crea un técnico (clave temporal) y este debe cambiarla
const tec = await A.call('usuarios_create', { data: { usuario: 'tec1', nombre: 'Técnico Uno', rol: 'tecnico', clave: 'Temporal12345', correo: `tec${sufijo}@a.com` } })
ok(tec.rol === 'tecnico' && tec.cambiarClave === true, 'usuarios_create crea el técnico')
await rechaza(() => A.call('usuarios_create', { data: { usuario: 'tec1', nombre: 'x', rol: 'tecnico', clave: 'Temporal12345', correo: `otro${sufijo}@a.com` } }), 'usuario repetido', /ya existe/i)
const lt = await T.call('login', { usuario: `tec${sufijo}@a.com`, clave: 'Temporal12345' })
ok(lt.usuario.cambiarClave === true, 'el técnico entra con clave temporal y debe cambiarla')
await rechaza(() => T.call('visitas_list', {}), 'sin cambiar la clave no se usa la app', /CAMBIAR_CLAVE|cambiar tu clave/)
await rechaza(() => T.call('cambiar_clave', { actual: 'Temporal12345', nueva: 'corta' }), 'clave nueva débil', /10 caracteres|al menos/i)
const cc = await T.call('cambiar_clave', { actual: 'Temporal12345', nueva: 'NuevaClave12345' })
ok(cc.usuario.cambiarClave === false, 'cambiar_clave quita la obligación')
ok((await A.call('tecnicos_list')).some((t) => t.usuario === 'tec1'), 'tecnicos_list incluye al técnico')

// --- visitas
const manana = '2026-11-21'
const v = await A.call('visitas_create', { data: { fecha: manana, hora: '09:30', cliente: 'Ferretería Sol', direccion: 'Av. 1', telefono: '099', tipo: 'Inspección', responsable: 'tec1', notas: '' } })
ok(v.hora === '09:30' && v.responsable === 'tec1' && v.autor === 'ana' && v.estado === 'Programada' && v.clienteId, 'visitas_create devuelve la forma de la app (usuarios por nombre, cliente registrado)', JSON.stringify(v))
const v2 = await A.call('visitas_create', { data: { id: v.id, fecha: manana, hora: '09:30', cliente: 'Ferretería Sol', tipo: 'Inspección', responsable: 'tec1' } })
ok(v2.id === v.id, 'repetir la creación con el mismo id no duplica')
await rechaza(() => A.call('visitas_create', { data: { fecha: manana, hora: '10:00', cliente: 'X', tipo: 'Inspección', responsable: 'nadie' } }), 'responsable inexistente', /Técnico inválido/)
const lista = await A.call('visitas_list', { desde: manana, orden: 'asc' })
ok(lista.items.length === 1 && lista.total === 1 && lista.antes === 0, 'visitas_list con filtros y total')
ok((await A.call('visitas_list', { q: 'ferret' })).total === 1 && (await A.call('visitas_list', { q: 'zzzz' })).total === 0, 'visitas_list busca por cliente, dirección o tipo')
for (const [i, nombre] of ['Panadería Luna', 'Taller Sur', 'Hotel Centro'].entries()) {
  await A.call('visitas_create', { data: { fecha: `2026-12-0${i + 1}`, hora: '10:00', cliente: nombre, tipo: 'Mantenimiento', responsable: 'tec1' } })
}
const pag1 = await A.call('visitas_list', { orden: 'asc', limit: 2, offset: 0 })
const pag2 = await A.call('visitas_list', { orden: 'asc', limit: 2, offset: 2 })
ok(pag1.items.length === 2 && pag1.total === 4 && pag1.hasMore && pag2.items.length === 2 && !pag2.hasMore && pag1.items[0].id !== pag2.items[0].id, 'visitas_list pagina con limit y offset y devuelve el total')
const cl = await A.call('clientes_list', {})
ok(cl.total === 4 && cl.items.some((c) => c.nombre === 'Ferretería Sol'), 'los clientes quedaron registrados al agendar')
await rechaza(() => A.call('clientes_delete', { id: cl.items.find((c) => c.nombre === 'Ferretería Sol').id }), 'no se borra un cliente con visitas', /visitas registradas/)
await rechaza(() => T.call('clientes_list', {}), 'el técnico no ve clientes', /permisos/)

// --- técnico: solo lo suyo, y transiciones
ok((await T.call('visitas_list', {})).items.length === 4, 'el técnico ve solo sus visitas')
ok((await B.call('visitas_list', {})).items.length === 0, 'la empresa B no ve visitas de A')
await rechaza(() => T.call('visitas_update', { id: v.id, data: { estado: 'Realizada' } }), 'transición inválida', /no permitido/)
await rechaza(() => T.call('visitas_update', { id: v.id, data: { estado: 'Cancelada' } }), 'cancelar exige motivo', /motivo/)
const acep = await T.call('visitas_update', { id: v.id, data: { estado: 'Aceptada' } })
ok(acep.estado === 'Aceptada', 'el técnico acepta la visita')
const noti = await A.call('notificaciones_list', {})
ok(noti.noLeidas === 1 && noti.items[0].tipo === 'visita_estado', 'el admin recibe el aviso de aceptación', JSON.stringify(noti))
await A.call('notificaciones_leer', { todas: true })
ok((await A.call('notificaciones_list', { resumen: true })).noLeidas === 0, 'notificaciones_leer marca todas')
ok((await T.call('notificaciones_list', {})).items.some((n) => n.tipo === 'visita_asignada'), 'el técnico recibió el aviso de visita asignada')

// --- informes
const inf = await T.call('informes_create', { data: { visitaId: v.id, fecha: manana, cliente: 'Ferretería Sol', titulo: 'Revisión', tipo: 'Inspección', estado: 'Borrador', responsable: 'tec1', checklist: JSON.stringify([{ texto: 'Cámaras', resultado: 'falla', obs: '' }]) } })
ok(/^INF-\d{4}$/.test(inf.numero) && inf.autor === 'tec1', 'informes_create numera el informe', inf.numero)
await rechaza(() => T.call('informes_update', { id: inf.id, data: { estado: 'Finalizado' } }), 'no se finaliza con la checklist incompleta', /checklist/i)
const fin = await T.call('informes_update', { id: inf.id, data: { estado: 'Finalizado', checklist: JSON.stringify([{ texto: 'Cámaras', resultado: 'falla', obs: 'Lente sucio' }]) } })
ok(fin.estado === 'Finalizado' && typeof fin.checklist === 'string', 'se finaliza con la checklist completa')
await rechaza(() => T.call('informes_update', { id: inf.id, data: { titulo: 'otro' } }), 'un informe finalizado no lo edita el técnico', /finalizado/i)
const li = await A.call('informes_list', {})
ok(li.items.length === 1 && li.items[0].descripcion === undefined && li.total === 1, 'informes_list es liviano (sin descripción ni checklist)')
ok((await A.call('informes_list', { q: 'revis' })).items.length === 1 && (await A.call('informes_list', { q: 'zzz' })).items.length === 0, 'búsqueda por texto')
ok((await B.call('informes_list', {})).total === 0, 'B no ve informes de A')
ok((await A.call('notificaciones_list', {})).items.some((n) => n.tipo === 'informe_finalizado'), 'el admin recibe el aviso de informe finalizado')

// --- configuración
await rechaza(() => A.call('configuracion_update', { seccion: 'tema', data: { primario: '#ffff00', acento: '#f6c915' } }), 'color demasiado claro', /demasiado claro/)
const cfg = await A.call('configuracion_update', { seccion: 'empresa', data: { nombre: 'Mi Empresa SA', subtitulo: 'Seguridad' } })
ok(cfg.empresa.nombre === 'Mi Empresa SA', 'configuracion_update guarda la sección')
ok((await B.call('configuracion_get')).empresa.nombre === 'Empresa B', 'la configuración es por empresa')
const rest = await A.call('configuracion_update', { seccion: 'empresa', restablecer: true })
ok(rest.empresa === undefined, 'restablecer elimina la sección')
await rechaza(() => T.call('configuracion_update', { seccion: 'logo', data: { logo: '' } }), 'el técnico no cambia la configuración', /permisos/)
await rechaza(() => T.call('usuarios_list'), 'el técnico no lista usuarios', /permisos/)

// --- una empresa desactivada deja sin acceso a sus usuarios
await P.call('empresas_update', { id: idA, data: { activa: false } })
await rechaza(() => A.call('login', { usuario: `ana${sufijo}@a.com`, clave: claveA }), 'empresa desactivada: sus usuarios no entran', /no pertenece|incorrectos/)
await P.call('empresas_update', { id: idA, data: { activa: true } })
await A.call('login', { usuario: `ana${sufijo}@a.com`, clave: claveA })
ok(true, 'al reactivarla vuelven a entrar')

// --- fotos (la subida real se prueba en probar-fotos.mjs) y cierre de sesión
ok((await A.call('fotos_list', { visitaId: v.id })).length === 0, 'fotos_list funciona (vacía)')
await rechaza(() => A.call('fotos_upload', { id: crypto.randomUUID(), visitaId: v.id, imagen: 'x' }), 'sin servicio de fotos configurado se avisa', /VITE_FOTOS_URL/)
await A.call('usuarios_update', { id: tec.id, data: { activo: false } })
T.olvidarCaches() // equivale a que pasen los 30 s del caché de perfil
await rechaza(() => T.call('visitas_list', {}), 'un usuario desactivado pierde el acceso', /AUTH|expirada|no pertenece/)
await A.call('logout')
await rechaza(() => A.call('visitas_list', {}), 'tras cerrar sesión se exige entrar', /AUTH|expirada/)

console.log(fallos ? `${fallos} fallos` : 'Todo correcto')
process.exit(fallos ? 1 : 0)

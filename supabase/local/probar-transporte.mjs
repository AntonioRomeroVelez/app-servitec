// Prueba el transporte de Supabase (src/supabase/transporte.js) contra el Supabase local: el mismo contrato que usa la app.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crearTransporte } from '../../src/supabase/transporte.js'
import { prepararPlataforma, crearEmpresaConAdmin, crearUsuario, persona, cedulaDe } from './ayudas.mjs'

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
const ea = await crearEmpresaConAdmin(P, A, { empresa: 'Empresa A', nombre: 'Ana Admin Pérez', clave: claveA, datos: { ruc: '1790000000001', telefono: '022222222', subtitulo: 'Seguridad' } })
ok(ea.sesion.usuario.rol === 'superadmin' && ea.sesion.token && ea.sesion.usuario.plataforma === false, 'empresas_create crea la empresa y su administrador (superadmin de esa empresa)')
ok(/^ana\d{4}[a-z]*\d*$/.test(ea.usuario), `el usuario sugerido es primer nombre + 4 dígitos de la cédula: ${ea.usuario}`)
ok(ea.sesion.usuario.cedula && ea.sesion.usuario.telefono === '0991234567' && ea.sesion.usuario.ciudad === 'Quito' && ea.sesion.usuario.correo.endsWith('@prueba.test'), 'el administrador guarda cédula, teléfono, ciudad y correo de contacto')
const eb = await crearEmpresaConAdmin(P, B, { empresa: 'Empresa B', nombre: 'Beto Benítez Ríos', clave: claveA })
ok((await A.call('configuracion_get')).empresa.nombre === 'Empresa A' && (await A.call('configuracion_get')).empresa.ruc === '1790000000001', 'los datos de la empresa quedaron en su configuración')
await rechaza(() => A.call('empresas_list'), 'el administrador de una empresa no gestiona empresas', /permisos/)
await rechaza(() => A.cliente.rpc('registrar_empresa', { p_empresa: 'X', p_nombre: 'x', p_usuario: 'xxx' }).then(({ error }) => { if (error) throw new Error(error.message) }), 'el registro abierto está cerrado', /permission|permiso/i)
const empresasLista = await P.call('empresas_list')
ok([ea.id, eb.id].every((id) => empresasLista.some((e) => e.id === id)) && empresasLista.find((e) => e.id === ea.id).usuarios === 1, 'empresas_list muestra las empresas y su número de usuarios')
const adminMal = (extra) => P.call('empresas_create', { data: { nombre: 'Mal', admin: { ...persona('Persona Prueba Uno'), clave: 'ClaveSegura123', ...extra } } })
await rechaza(() => adminMal({ nombre: 'Solo' }), 'los nombres completos son obligatorios', /nombres completos/)
await rechaza(() => adminMal({ cedula: '1710034066' }), 'cédula con dígito verificador incorrecto', /verificador/)
await rechaza(() => adminMal({ correo: 'sin-arroba' }), 'correo inválido', /correo no es válido/)
await rechaza(() => adminMal({ telefono: '123' }), 'teléfono inválido', /teléfono no es válido/)
await rechaza(() => adminMal({ ciudad: '' }), 'la ciudad es obligatoria', /ciudad/)
const idA = ea.id
await P.call('empresas_update', { id: idA, data: { plan: 'pro', datos: { direccion: 'Av. Principal 123' } } })
const edit = (await P.call('empresas_list')).find((e) => e.id === idA)
ok(edit.plan === 'pro' && edit.datos.direccion === 'Av. Principal 123' && edit.datos.ruc === '1790000000001', 'empresas_update cambia plan y datos sin perder los demás')
await rechaza(() => A.call('login', { usuario: ea.usuario, clave: 'mala' }), 'login con clave mala', /incorrectos/)
ok((await A.call('login', { usuario: ea.usuario.toUpperCase(), clave: claveA })).usuario.usuario === ea.usuario, 'se ingresa con el usuario (sin distinguir mayúsculas)')

// --- usuarios: el superadmin crea un técnico (clave temporal) y este debe cambiarla
const tec = await crearUsuario(A, 'Técnico Uno Gómez', 'tecnico', 1)
ok(tec.rol === 'tecnico' && tec.cambiarClave === true && /^tecnico\d{4}[a-z]*\d*$/.test(tec.usuario) && tec.cedula, `usuarios_create genera el usuario ${tec.usuario} y guarda los datos`)
await rechaza(() => crearUsuario(A, 'Otra Persona Distinta', 'tecnico', 1), 'cédula repetida en la empresa', /misma cédula|esa cédula/)
await rechaza(() => A.call('usuarios_create', { data: { ...persona('Dato Malo Cedula', 5, { cedula: '1234567890' }), rol: 'tecnico' } }), 'cédula inválida al crear un usuario', /verificador/)
await rechaza(() => A.call('usuarios_create', { data: { ...persona('Sin Rol Elegido', 6) } }), 'el rol es obligatorio', /rol/)
const tecB = await crearUsuario(B, 'Técnico Uno Gómez', 'tecnico', 1)
ok(tecB.usuario !== tec.usuario && tecB.usuario.startsWith('tecnico'), `el usuario es único en toda la plataforma: ${tecB.usuario}`)
await rechaza(() => T.call('login', { usuario: tec.usuario, clave: 'Temporal12345' }), 'ya no hay una clave fija: la temporal es la cédula', /incorrectos/)
const lt = await T.call('login', { usuario: tec.usuario, clave: cedulaDe(1) })
ok(lt.usuario.cambiarClave === true, 'el técnico entra con su cédula (clave temporal) y debe cambiarla')
await rechaza(() => T.call('visitas_list', {}), 'sin cambiar la clave no se usa la app', /CAMBIAR_CLAVE|cambiar tu clave/)
await rechaza(() => T.call('cambiar_clave', { actual: cedulaDe(1), nueva: 'corta' }), 'clave nueva débil', /10 caracteres|al menos/i)
const cc = await T.call('cambiar_clave', { actual: cedulaDe(1), nueva: 'NuevaClave12345' })
ok(cc.usuario.cambiarClave === false, 'cambiar_clave quita la obligación')
ok((await A.call('tecnicos_list')).some((t) => t.usuario === tec.usuario), 'tecnicos_list incluye al técnico')

// --- visitas
const manana = '2026-11-21'
const v = await A.call('visitas_create', { data: { fecha: manana, hora: '09:30', cliente: 'Ferretería Sol', direccion: 'Av. 1', telefono: '099', tipo: 'Inspección', responsable: tec.usuario, notas: '' } })
ok(v.hora === '09:30' && v.responsable === tec.usuario && v.autor === ea.usuario && v.estado === 'Programada' && v.clienteId, 'visitas_create devuelve la forma de la app (usuarios por nombre, cliente registrado)', JSON.stringify(v))
const v2 = await A.call('visitas_create', { data: { id: v.id, fecha: manana, hora: '09:30', cliente: 'Ferretería Sol', tipo: 'Inspección', responsable: tec.usuario } })
ok(v2.id === v.id, 'repetir la creación con el mismo id no duplica')
await rechaza(() => A.call('visitas_create', { data: { fecha: manana, hora: '10:00', cliente: 'X', tipo: 'Inspección', responsable: 'nadie' } }), 'responsable inexistente', /Técnico inválido/)
const lista = await A.call('visitas_list', { desde: manana, orden: 'asc' })
ok(lista.items.length === 1 && lista.total === 1 && lista.antes === 0, 'visitas_list con filtros y total')
ok((await A.call('visitas_list', { q: 'ferret' })).total === 1 && (await A.call('visitas_list', { q: 'zzzz' })).total === 0, 'visitas_list busca por cliente, dirección o tipo')
for (const [i, nombre] of ['Panadería Luna', 'Taller Sur', 'Hotel Centro'].entries()) {
  await A.call('visitas_create', { data: { fecha: `2026-12-0${i + 1}`, hora: '10:00', cliente: nombre, tipo: 'Mantenimiento', responsable: tec.usuario } })
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
const inf = await T.call('informes_create', { data: { visitaId: v.id, fecha: manana, cliente: 'Ferretería Sol', titulo: 'Revisión', tipo: 'Inspección', estado: 'Borrador', responsable: tec.usuario, checklist: JSON.stringify([{ texto: 'Cámaras', resultado: 'falla', obs: '' }]) } })
ok(/^INF-\d{4}$/.test(inf.numero) && inf.autor === tec.usuario, 'informes_create numera el informe', inf.numero)
await rechaza(() => T.call('informes_update', { id: inf.id, data: { estado: 'Finalizado' } }), 'no se finaliza con la checklist incompleta', /checklist/i)
const fin = await T.call('informes_update', { id: inf.id, data: { estado: 'Finalizado', checklist: JSON.stringify([{ texto: 'Cámaras', resultado: 'falla', obs: 'Lente sucio' }]) } })
ok(fin.estado === 'Finalizado' && typeof fin.checklist === 'string', 'se finaliza con la checklist completa')
await rechaza(() => T.call('informes_update', { id: inf.id, data: { titulo: 'otro' } }), 'un informe finalizado no lo edita el técnico', /finalizado/i)
const li = await A.call('informes_list', {})
ok(li.items.length === 1 && li.items[0].descripcion === undefined && li.total === 1, 'informes_list es liviano (sin descripción ni checklist)')
ok((await A.call('informes_list', { q: 'revis' })).items.length === 1 && (await A.call('informes_list', { q: 'zzz' })).items.length === 0, 'búsqueda por texto')
ok((await B.call('informes_list', {})).total === 0, 'B no ve informes de A')
ok((await A.call('notificaciones_list', {})).items.some((n) => n.tipo === 'informe_finalizado'), 'el admin recibe el aviso de informe finalizado')

// --- el administrador también elabora informes (con o sin visita) y ve los de su empresa
const AD = nuevo()
const adm = await crearUsuario(A, 'Admin Uno Vera', 'admin', 2)
await AD.call('login', { usuario: adm.usuario, clave: cedulaDe(2) })
await AD.call('cambiar_clave', { actual: cedulaDe(2), nueva: 'NuevaClave12345' })
const infAdmin = await AD.call('informes_create', { data: { fecha: manana, cliente: 'Cliente directo', titulo: 'Informe del administrador', tipo: 'Otro', estado: 'Borrador', checklist: '[]' } })
ok(/^INF-\d{4}$/.test(infAdmin.numero) && infAdmin.autor === adm.usuario, 'el administrador crea un informe sin visita y se numera')
const infAdminVisita = await AD.call('informes_create', { data: { visitaId: v.id, fecha: manana, cliente: 'Ferretería Sol', titulo: 'Informe de visita por admin', tipo: 'Inspección', estado: 'Finalizado', checklist: JSON.stringify([{ texto: 'x', resultado: 'ok', obs: '' }]) } })
ok(infAdminVisita.estado === 'Finalizado', 'el administrador crea un informe ligado a una visita ya finalizado')
ok((await AD.call('informes_list', {})).total === 3, 'el administrador ve los informes de su empresa (suyos y del técnico)')
ok((await T.call('informes_list', {})).items.every((i) => i.autor === tec.usuario || i.responsable === tec.usuario), 'el técnico solo ve los suyos')

// --- edición de los datos de un usuario (el usuario de ingreso no cambia)
const editado = await A.call('usuarios_update', { id: tec.id, data: { ciudad: 'Guayaquil', telefono: '0987654321', cargo: 'Técnico de campo', nombre: 'Técnico Uno Gómez Mejía' } })
ok(editado.ciudad === 'Guayaquil' && editado.cargo === 'Técnico de campo' && editado.usuario === tec.usuario, 'usuarios_update cambia los datos sin cambiar el usuario')
await rechaza(() => A.call('usuarios_update', { id: tec.id, data: { cedula: '1710034066' } }), 'al editar se valida la cédula', /verificador/)
await rechaza(() => A.call('usuarios_update', { id: tec.id, data: { telefono: 'abc' } }), 'al editar se valida el teléfono', /teléfono no es válido/)

// --- usuario sugerido (primer nombre + últimos 4 dígitos de la cédula; si está ocupado, letras del apellido) y editable
const azar = () => [...Array(8)].map(() => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('')
const primero = `Q${azar()}`
const ced = cedulaDe(40)
const sug1 = await A.call('usuarios_sugerir', { nombre: `${primero} Andrés Romero Vélez`, cedula: ced })
ok(sug1 === primero.toLowerCase() + ced.slice(-4), `usuarios_sugerir: primer nombre + 4 últimos dígitos (${sug1})`)
const u1 = await A.call('usuarios_create', { data: { ...persona(`${primero} Andrés Romero Vélez`, 40), rol: 'tecnico' } })
ok(u1.usuario === sug1, 'sin escribir usuario, la cuenta se crea con el sugerido')
const nombre2 = `${primero} Beatriz Romero Cruz`
const sug2 = await B.call('usuarios_sugerir', { nombre: nombre2, cedula: ced })
ok(sug2 === `${sug1}r`, `si está ocupado se agrega la primera letra del apellido (${sug2})`)
const u2 = await B.call('usuarios_create', { data: { ...persona(nombre2, 40), rol: 'tecnico' } })
ok(u2.usuario === sug2, 'el ocupado es de otra empresa: el usuario es único en toda la plataforma')
ok((await B.call('usuarios_sugerir', { nombre: `${primero} Carlos Romero Mora`, cedula: ced })) === `${sug1}ro`, 'si también está ocupado, la segunda letra del apellido')
ok((await A.call('usuarios_disponible', { usuario: sug1 })) === false && (await A.call('usuarios_disponible', { usuario: `libre${azar()}` })) === true, 'usuarios_disponible indica si un usuario está libre')
ok((await A.call('usuarios_disponible', { usuario: 'Con Espacios' })) === false, 'un usuario con formato inválido no está disponible')
const propio = `propio${azar()}`
const u3 = await A.call('usuarios_create', { data: { ...persona('Persona Con Usuario Propio', 41), usuario: propio, rol: 'admin' } })
ok(u3.usuario === propio, 'el usuario sugerido se puede modificar al crear la cuenta')
await rechaza(() => A.call('usuarios_create', { data: { ...persona('Otra Persona Distinta Más', 42), usuario: propio, rol: 'admin' } }), 'usuario escrito que ya existe', /ya está en uso/)
await rechaza(() => A.call('usuarios_create', { data: { ...persona('Otra Persona Distinta Más', 42), usuario: 'x', rol: 'admin' } }), 'usuario escrito con formato inválido', /inválido/)
await rechaza(() => T.call('usuarios_sugerir', { nombre: 'Juan Perez', cedula: ced }), 'el técnico no sugiere usuarios', /permisos/)
await rechaza(() => A.call('usuarios_sugerir', { nombre: 'Juan Perez', cedula: '12' }), 'sin cédula no hay sugerencia', /cédula/)

// --- restablecer la clave: vuelve a ser la cédula (temporal) y se debe cambiar al entrar
await A.call('usuarios_update', { id: u1.id, data: { clave: u1.cedula, temporal: true } })
await rechaza(() => A.call('usuarios_update', { id: u1.id, data: { clave: u1.cedula } }), 'una clave escrita a mano debe cumplir la política', /letras|caracteres/)
const R1 = nuevo()
ok((await R1.call('login', { usuario: u1.usuario, clave: u1.cedula })).usuario.cambiarClave === true, 'tras restablecer entra con la cédula y debe cambiar la clave')
await R1.call('cambiar_clave', { actual: u1.cedula, nueva: 'ClaveNueva12345' })
ok(!(await A.cliente.rpc('restablecer_clave', { p_id: u1.id })).error, 'restablecer_clave sin clave usa la cédula del usuario')
const R2 = nuevo()
ok((await R2.call('login', { usuario: u1.usuario, clave: u1.cedula })).usuario.cambiarClave === true, 'la cédula vuelve a ser la clave temporal')

// --- el superadmin de cada empresa restablece la clave de sus usuarios (y de nadie más)
const vic = await crearUsuario(A, 'Victima Reset Prueba', 'tecnico', 60)
const V1 = nuevo()
await V1.call('login', { usuario: vic.usuario, clave: cedulaDe(60) })
await V1.call('cambiar_clave', { actual: cedulaDe(60), nueva: 'ClaveVictima12345' })
await V1.call('dashboard_resumen') // tiene la sesión abierta y funcionando
await rechaza(() => B.call('usuarios_update', { id: vic.id, data: { clave: cedulaDe(60), temporal: true } }), 'el superadmin de otra empresa no restablece claves ajenas', /No encontrado|permisos/)
ok((await B.cliente.rpc('restablecer_clave', { p_id: vic.id })).error?.message?.includes('No encontrado'), 'ni siquiera por la API directa (la base lo impide)')
await rechaza(() => AD.call('usuarios_update', { id: vic.id, data: { clave: cedulaDe(60), temporal: true } }), 'un administrador (no superadmin) no restablece claves', /permisos/)
await rechaza(() => T.call('usuarios_update', { id: vic.id, data: { clave: cedulaDe(60), temporal: true } }), 'un técnico no restablece claves', /permisos/)
await A.call('usuarios_update', { id: vic.id, data: { clave: cedulaDe(60), temporal: true } })
await rechaza(() => V1.cliente.auth.refreshSession().then(({ error }) => { if (error) throw new Error(error.message) }), 'las sesiones abiertas del usuario quedan cerradas (no se pueden renovar)', /.+/)
await rechaza(() => V1.call('login', { usuario: vic.usuario, clave: 'ClaveVictima12345' }), 'la clave anterior ya no sirve', /incorrectos/)
const V2 = nuevo()
ok((await V2.call('login', { usuario: vic.usuario, clave: cedulaDe(60) })).usuario.cambiarClave === true, 'entra con la clave restablecida y debe cambiarla')
await rechaza(() => V2.call('dashboard_resumen'), 'mientras no la cambie no puede usar la app', /cambiar tu clave|CAMBIAR/)
ok((await A.call('usuarios_update', { id: ea.sesion.usuario.id, data: { nombre: ea.sesion.usuario.nombre } })).usuario === ea.usuario, 'el superadmin sigue pudiendo editar datos de su propio perfil')

// --- la plataforma restablece la clave del administrador de cualquier empresa
const empC = await crearEmpresaConAdmin(P, nuevo(), { empresa: 'Empresa C', nombre: 'Carla Cevallos Mora', clave: 'ClaveCarla12345', n: 70 })
const adminsC = await P.call('empresas_admins', { id: empC.id })
ok(adminsC.length === 1 && adminsC[0].usuario === empC.usuario && adminsC[0].cedula === cedulaDe(70), 'empresas_admins lista los administradores de la empresa')
await rechaza(() => A.call('empresas_admins', { id: empC.id }), 'el superadmin de una empresa no administra las de otras', /permisos/)
await P.call('empresas_restablecer_admin', { id: adminsC[0].id, clave: adminsC[0].cedula, temporal: true })
const CC = nuevo()
ok((await CC.call('login', { usuario: empC.usuario, clave: cedulaDe(70) })).usuario.cambiarClave === true, 'la plataforma restablece al administrador: entra con la cédula y debe cambiarla')
await rechaza(() => nuevo().call('login', { usuario: empC.usuario, clave: 'ClaveCarla12345' }), 'la clave anterior del administrador ya no sirve', /incorrectos/)
await rechaza(() => P.call('empresas_restablecer_admin', { id: vic.id, clave: cedulaDe(60), temporal: true }), 'solo restablece superadmins, no técnicos ni admins', /No encontrado/)
await rechaza(() => P.call('empresas_restablecer_admin', { id: ea.sesion.usuario.id, clave: 'corta' }), 'una clave escrita a mano debe cumplir la política', /10 caracteres|letras/)
await rechaza(() => A.call('empresas_restablecer_admin', { id: adminsC[0].id, clave: cedulaDe(70), temporal: true }), 'el superadmin de otra empresa no puede usar esta vía', /permisos/)
ok((await A.cliente.rpc('restablecer_clave_admin', { p_id: adminsC[0].id })).error?.message?.includes('Sin permisos'), 'ni por la API directa')
ok((await P.cliente.rpc('restablecer_clave_admin', { p_id: (await P.call('me')).id })).error?.message?.includes('Mi cuenta'), 'la plataforma no restablece su propia clave por esta vía')

// --- Dashboard: cifras por rol (el técnico solo cuenta lo suyo) y resumen de la plataforma
const dA = await A.call('dashboard_resumen')
const dT = await T.call('dashboard_resumen')
const claves = ['visitasHoy', 'proximas', 'porAceptar', 'enCurso', 'realizadasMes', 'atrasadas', 'informesBorrador', 'informesFinalizadosMes', 'clientes', 'tecnicos']
ok(claves.every((k) => typeof dA[k] === 'number') && dA.porDia.length === 14 && Array.isArray(dA.proximasLista) && Array.isArray(dA.ultimosInformes), 'dashboard_resumen entrega las cifras, el gráfico y las listas')
ok(dA.porDia.filter((d) => d.fecha === dA.hoy).length === 1, 'el gráfico incluye el día de hoy (7 atrás y 7 por delante)')
ok(dA.clientes >= 4 && dT.clientes === 0, 'el técnico no ve el conteo de clientes')
ok(dA.ultimosInformes.length >= 2 && dT.ultimosInformes.every((i) => i.id), 'últimos informes de la empresa (admin) y solo los del técnico')
ok(dT.informesBorrador + dT.informesFinalizadosMes <= dA.informesBorrador + dA.informesFinalizadosMes, 'el técnico cuenta menos o igual que el administrador')
ok(dA.plataforma === undefined && dT.plataforma === undefined, 'solo la plataforma recibe su resumen')
const dP = await P.call('dashboard_resumen')
ok(dP.plataforma.empresas >= 2 && dP.plataforma.activas >= 2 && dP.plataforma.usuarios >= 4 && typeof dP.plataforma.porPlan === 'object', 'resumen de la plataforma: empresas, usuarios y planes')
ok((await B.call('dashboard_resumen')).visitasHoy === 0 && (await B.call('dashboard_resumen')).proximasLista.length === 0, 'cada empresa ve solo su resumen')

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
await rechaza(() => A.call('login', { usuario: ea.usuario, clave: claveA }), 'empresa desactivada: sus usuarios no entran', /no pertenece|incorrectos/)
await P.call('empresas_update', { id: idA, data: { activa: true } })
await A.call('login', { usuario: ea.usuario, clave: claveA })
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

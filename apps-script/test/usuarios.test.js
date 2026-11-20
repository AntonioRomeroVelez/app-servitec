// Reglas de datos de personas: cédula ecuatoriana, teléfono, correo y nombre de usuario generado.
import test from 'node:test'
import assert from 'node:assert/strict'
import { cedulaValida, motivoCedulaInvalida, telefonoValido, correoValido, generarUsuario, usuarioValido } from '../../src/utils.js'

test('cédula ecuatoriana: dígito verificador, provincia y formato', () => {
  assert.ok(cedulaValida('1710034065'))
  assert.ok(cedulaValida('0926687856'))
  assert.ok(!cedulaValida('1710034066'), 'dígito verificador incorrecto')
  assert.ok(!cedulaValida('9910034065'), 'provincia inexistente')
  assert.ok(!cedulaValida('1790034065'), 'tercer dígito no permitido')
  assert.ok(!cedulaValida('171003406'), 'faltan dígitos')
  assert.ok(!cedulaValida('17100340a5'), 'solo dígitos')
  assert.ok(!cedulaValida(''))
})

test('cédula: el mensaje dice qué está mal', () => {
  assert.equal(motivoCedulaInvalida('1710034065'), '')
  assert.match(motivoCedulaInvalida(''), /Escribe/)
  assert.match(motivoCedulaInvalida('17100a4065'), /solo lleva números/)
  assert.match(motivoCedulaInvalida('171003'), /10 dígitos \(tiene 6\)/)
  assert.match(motivoCedulaInvalida('9910034065'), /provincia/)
  assert.match(motivoCedulaInvalida('1790034065'), /tercer dígito/)
  assert.match(motivoCedulaInvalida('1234567890'), /verificador/)
  assert.match(motivoCedulaInvalida('1111111111'), /verificador/)
})

test('teléfono: de 7 a 15 dígitos', () => {
  assert.ok(telefonoValido('0991234567'))
  assert.ok(telefonoValido('+593 99 123 4567'))
  assert.ok(telefonoValido('02-222-2222'))
  assert.ok(!telefonoValido('12345'))
  assert.ok(!telefonoValido('abc1234567'))
})

test('correo: formato básico', () => {
  assert.ok(correoValido('carlos@empresa.com'))
  assert.ok(!correoValido('carlos@empresa'))
  assert.ok(!correoValido('carlos empresa.com'))
})

test('usuario sugerido: primer nombre + últimos 4 dígitos de la cédula', () => {
  assert.equal(generarUsuario('Carlos Andrés Romero Vélez', '1710034065'), 'carlos4065')
  assert.equal(generarUsuario('María López', '0926687856'), 'maria7856')
  assert.equal(generarUsuario('  ÁNGEL   Ríos  ', '1710034065'), 'angel4065')
  assert.equal(generarUsuario('José Ñandú de la Cruz Pérez', '1710034065'), 'jose4065')
  assert.equal(generarUsuario('Pedro', '1710034065'), 'pedro4065')
})

test('sin nombre o sin 4 dígitos de cédula todavía no hay sugerencia', () => {
  assert.equal(generarUsuario('', '1710034065'), '')
  assert.equal(generarUsuario('Carlos Romero', ''), '')
  assert.equal(generarUsuario('Carlos Romero', '171'), '')
})

test('si el usuario está ocupado se agrega la primera letra del apellido, luego la segunda...', () => {
  const nombre = 'Carlos Andrés Romero Vélez'
  assert.equal(generarUsuario(nombre, '1710034065', ['carlos4065']), 'carlos4065r')
  assert.equal(generarUsuario(nombre, '1710034065', ['carlos4065', 'carlos4065r']), 'carlos4065ro')
  assert.equal(generarUsuario(nombre, '1710034065', ['CARLOS4065']), 'carlos4065r')
  assert.equal(generarUsuario('Carlos Romero', '1710034065', ['carlos4065']), 'carlos4065r', 'con 2 palabras el apellido es la última')
})

test('agotadas las letras del apellido se agrega un número', () => {
  const tomados = ['carlos4065', 'carlos4065r', 'carlos4065ro', 'carlos4065rom', 'carlos4065rome', 'carlos4065romer', 'carlos4065romero']
  assert.equal(generarUsuario('Carlos Romero', '1710034065', tomados), 'carlos4065romero2')
  assert.equal(generarUsuario('Carlos', '1710034065', ['carlos4065']), 'carlos40652', 'sin apellido va directo al número')
})

test('el usuario sugerido cumple el formato permitido y cabe en 30 caracteres', () => {
  const u = generarUsuario('Alexandrasofia Valentina Montenegrocastellanos Torre', '1710034065', ['alexandrasofia4065'])
  assert.ok(usuarioValido(u), u)
  assert.ok(!usuarioValido('ab'))
  assert.ok(!usuarioValido('Carlos 4065'))
  assert.ok(usuarioValido('carlos.4065'))
})

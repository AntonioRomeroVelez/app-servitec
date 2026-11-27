import test from 'node:test'
import assert from 'node:assert/strict'
import { PLANTILLA_FABRICA, BLOQUES_LISTOS, MODELOS_MENSAJE, MAX_MENSAJE, aBloques, deBloques, limpiarMensaje, aplicarFormato, trozosConFormato, variablesDesconocidas } from '../../src/whatsapp.js'

test('editor: separar en bloques y volver a unir no cambia el mensaje', () => {
  assert.equal(deBloques(aBloques(PLANTILLA_FABRICA)), PLANTILLA_FABRICA)
  assert.deepEqual(aBloques('uno\n\n\n \ndos'), ['uno', 'dos'])
  assert.equal(limpiarMensaje('\n\nuno\n\n\n\ndos\n\n'), 'uno\n\ndos')
})

test('editor: poner y quitar formato sobre lo seleccionado', () => {
  const puesto = aplicarFormato('hola mundo', 5, 10, 'negrita')
  assert.equal(puesto.texto, 'hola *mundo*')
  assert.equal(puesto.texto.slice(puesto.desde, puesto.hasta), 'mundo')
  assert.equal(aplicarFormato(puesto.texto, puesto.desde, puesto.hasta, 'negrita').texto, 'hola mundo')
  assert.equal(aplicarFormato('a \nb', 0, 4, 'cursiva').texto, '_a_ \n_b_')
  assert.equal(aplicarFormato('', 0, 0, 'tachado').texto, '~texto~')
  const lista = aplicarFormato('uno\ndos', 1, 5, 'lista')
  assert.equal(lista.texto, '- uno\n- dos')
  assert.equal(aplicarFormato(lista.texto, lista.desde, lista.hasta, 'lista').texto, 'uno\ndos')
  assert.equal(aplicarFormato('\ndos', 0, 0, 'cita').texto, '> \ndos')
})

test('editor: texto de ancho fijo en la vista previa', () => {
  assert.deepEqual(trozosConFormato('cod ```AB12```'), [{ texto: 'cod ', formato: '' }, { texto: 'AB12', formato: 'fijo' }])
})

test('editor: los bloques y modelos usan variables que existen y caben en el límite', () => {
  for (const m of [...BLOQUES_LISTOS.map((b) => b.contenido), ...MODELOS_MENSAJE.map((x) => x.mensaje)]) {
    assert.deepEqual(variablesDesconocidas(m), [])
    assert.ok(m.length <= MAX_MENSAJE)
  }
})

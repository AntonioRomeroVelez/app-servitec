// Permite que Node resuelva imports sin extensión (como Vite) al probar el código del frontend.
export async function resolve(especificador, contexto, siguiente) {
  try {
    return await siguiente(especificador, contexto)
  } catch (e) {
    if (e.code === 'ERR_MODULE_NOT_FOUND' && /^\./.test(especificador)) return siguiente(especificador + '.js', contexto)
    throw e
  }
}

# Servicio de fotos (Google Drive)

Apps Script aparte del backend heredado. Solo mueve archivos en tu Drive; cada llamada lleva el token de sesión de
Supabase del usuario y la base decide si puede subir, ver o borrar. No guarda datos ni claves maestras.

Estructura en Drive: `ServiTec Fotos / <Empresa (id)> / <usuario> / <AAAA-MM> / archivo.jpg`.

## Publicarlo

1. Entra a <https://script.google.com> con la cuenta de Google donde quieres guardar las fotos y crea un proyecto nuevo.
2. Pega el contenido de `Code.gs`.
3. En **Configuración del proyecto > Propiedades de la secuencia de comandos** agrega:
   - `SUPABASE_URL`: la URL del proyecto (`https://xxxx.supabase.co`).
   - `SUPABASE_ANON_KEY`: la clave pública (anon) del proyecto.
   - `RAIZ_ID` (opcional): id de una carpeta existente; si falta se crea `ServiTec Fotos` en tu Drive.
4. **Implementar > Nueva implementación > Aplicación web**: ejecutar como *Yo*, acceso *Cualquier persona*.
   La primera vez Google pide autorizar el acceso a Drive.
5. Copia la URL de la implementación (termina en `/exec`) y ponla en el `.env` del frontend:
   `VITE_FOTOS_URL=https://script.google.com/macros/s/.../exec`
6. Al cambiar `Code.gs`, crea una **nueva versión** de la implementación.

## Seguridad

- Sin token válido de Supabase no se hace nada: la base rechaza la consulta (401).
- Permisos, estado de la visita (el técnico debe aceptarla) y el máximo de 25 fotos los aplica la base.
- Los ids de carpeta guardados en la base solo se aceptan si de verdad cuelgan de la carpeta esperada,
  así nadie puede desviar una subida a otra carpeta de tu Drive.
- Al eliminar una foto o una visita, los archivos van a la papelera de Drive (no se borran de forma definitiva).

## Pruebas

`npm run supabase:probar` ejecuta este `Code.gs` real con un Drive simulado contra el Supabase local
(`supabase/local/probar-fotos.mjs`).

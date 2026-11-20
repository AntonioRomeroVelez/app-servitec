# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# ServiTec: documentación del proyecto

App móvil (PWA) para agendar visitas técnicas y crear informes (checklist, firma, fotos, PDF). Frontend Vue 3 + Vite + Tailwind v4; backend en Google Apps Script sobre Google Sheets (base de datos) y Drive (fotos). Repositorio: https://github.com/AntonioRomeroVelez/app-servitec (rama `main`). El detalle de uso y despliegue está en `README.md`.

## Reglas del usuario (obligatorias)

- Todo en español: respuestas, textos de la interfaz, mensajes de error, comentarios y documentación.
- Nunca emojis ni glifos como iconos: solo Lucide (`lucide-vue-next`).
- Todo campo de clave lleva botón mostrar/ocultar (`CampoClave.vue`).
- El Sheet registra quién hizo cada acción, con fecha `19-11-2026` y hora `14:13` (hoja Bitácora).
- El superadmin personaliza empresa, colores, logo y contenido de los informes (sección Ajustes).
- Menú: botón hamburguesa arriba a la izquierda, con botones y subbotones en cascada. No hay barra inferior.
- Nunca subir `.env` ni claves al repositorio.

## Comandos

```bash
npm run dev            # servidor de desarrollo (vite --host)
npm run build          # compila a dist/ (genera service worker y manifiesto)
npm run preview        # sirve dist/
npm run test:gs        # todas las pruebas (node --test apps-script/test/*.test.js); hoy 105
node --test apps-script/test/seguridad.test.js   # una sola suite
npm run servidor:local # Code.gs real sobre HTTP en el puerto 5400 (/__red?estado=off|on, /__hoja?nombre=...)
node scripts/generar-iconos.mjs                  # regenera los iconos de public/
```

- Sin `VITE_SCRIPT_URL` la app corre en modo demo (localStorage): usuarios `superadmin / superadmin123`, `admin / admin123`, técnico en la pantalla de login. Para ver la app sin tocar el backend real: `VITE_SCRIPT_URL= npx vite build --outDir dist-local` y `vite preview --outDir dist-local`.
- `VITE_BASE=/subcarpeta/` al compilar si se publica en una subcarpeta (GitHub Pages).
- El puerto 5173 puede estar ocupado por otro proyecto: no matar procesos ajenos; usar otro puerto y cerrar solo los propios.

## Roles

- `superadmin`: todo, incluido Usuarios y Ajustes de la app.
- `admin`: agenda visitas, ve todo, gestiona clientes, genera el QR de instalación.
- `tecnico`: ve sus visitas; acepta, inicia, finaliza o cancela (transiciones en `TRANSICIONES_TECNICO`), crea informes y sube fotos.

## Arquitectura

### Backend: `apps-script/Code.gs`

- Web App con `doGet` (estado) y `doPost` (acciones). Tablas definidas con `headers`, `ligeras` (columnas livianas; las pesadas van al final), `texto` y `formatos`. Hojas: Usuarios, Visitas, Informes, Fotos, Notificaciones, Clientes, Bitácora (fecha, hora, usuario, rol, accion, detalle, ref) y Configuración (clave, valor, modificadoPor, actualizado).
- Lecturas con `CacheService` (usuarios, tokens `t_`, bloqueo por intentos `f_`, configuración); `LockService` solo en escrituras (regex `ES_LECTURA`). Creaciones idempotentes con UUID generado por el cliente.
- Sesión: token `idUsuario:versionSesion`. Clave con hash `v2:` (SHA-256 × 600 rondas, sal por usuario); política de al menos 10 caracteres con letras y números; bloqueo tras intentos fallidos; cambio de clave obligatorio en el primer ingreso.
- Correos con `MailApp` (se encolan y se envían fuera del lock). Disparadores `enviarRecordatorios` (18:00) y `limpiarNotificaciones` (03:00), instalados con `instalarTriggers`.
- Funciones del editor: `crearSuperadmin`, `diagnosticoUsuarios`, `registrarClientesExistentes`, `aplicarFormatos`, `instalarTriggers`. `crearSuperadmin` lee `SUPERADMIN_USUARIO`, `SUPERADMIN_CLAVE` y `SUPERADMIN_NOMBRE` de las propiedades de la secuencia de comandos (nunca del código) y borra la clave al terminar. Si la hoja está vacía, el primer login crea el superadmin genérico `superadmin` (clave documentada en el README): por eso conviene ejecutar `crearSuperadmin` antes.
- Fotos: se guardan en Drive en carpeta por administrado/técnico y subcarpetas por mes; al borrar una visita sus fotos van a la papelera de Drive.
- Los valores por defecto de la configuración (`CONFIG_DEFECTO`) deben coincidir con `src/configuracion.js`; una prueba lo verifica.

### Frontend: `src/`

- `App.vue`: encabezado con hamburguesa, menú lateral (`MenuLateral.vue` + `ItemMenu.vue`, recursivo), árbol `arbol` (computed con `grupo()`/`hoja()`; un grupo con un solo hijo se colapsa a hoja), vistas por la ref `vista` (sin router), botón flotante "+" en agenda e informes. Si la URL trae `?instalar=1` muestra primero `InstalarView` (completa) y luego sigue al ingreso.
- `api.js`: `call(action, payload)` al Apps Script, o modo demo. Conecta la capa sin conexión (no aplica al demo).
- `offline/`: `almacen.js` (IndexedDB), `overlay.js` (cambios pendientes sobre las lecturas), `capa.js` (cola, reintentos, sincronización automática), `conexion.js`, `estado.js`, `descripcion.js`. Probado: cortar red, recargar, arrancar solo con el service worker, sincronizar sin duplicados.
- `composables/`: `useRecurso` (fábrica), `useInformes`, `useVisitas`, `useClientes`, `useAuth`, `useFotos`, `useNotificaciones`, `useConfiguracion`, `useTecnicos`, `useUsuarios`, `useToast` (avisos emergentes), `useInstalacion` (evento `beforeinstallprompt`, estado instalada).
- `views/`: Login, Clave, Agenda (filtros Próximas/Hoy/Pasadas/Todas en cuadrícula: 2 columnas en pantallas angostas, 4 desde `sm`), FormVisita (autocompleta clientes), DetalleVisita, ListaInformes, FormInforme, DetalleInforme (PDF con encabezado y pie de la configuración), Clientes, Usuarios, Notificaciones, Pendientes, Configuracion, Instalar, QrInstalar.
- `plataforma.js`: funciones puras para detectar sistema/navegador, armar el enlace del QR (`?instalar=1`) y avisar de direcciones sin HTTPS o internas. `tema.js`: paleta a partir del color primario con contraste WCAG. `app.js`: nombre del producto (`APP`).
- Avisos: toasts con `composables/useToast.js` (`exito`, `error`, `info`) y `components/ToastContenedor.vue` (montado en `App.vue`). No usar banners ni `alert()` para avisos; los errores de `useVisitas`/`useInformes` se muestran como toast.
- Estilos: Tailwind v4 con `@theme` (`--color-brand-50..950`, `--color-acento`, `--color-acento-600`, `--color-acento-texto`) y `@utility` (`campo`, `etiqueta`, `btn`, `btn-borde`, `btn-peligro`, `btn-acento`, `tarjeta`). No usar `@apply` con clases propias: se definen como `@utility`.

### PWA

- `vite.config.js`: `vite-plugin-pwa` (`generateSW`, `autoUpdate`), manifiesto con `display: standalone`, `display_override`, iconos 192/512/maskable, `base` desde `VITE_BASE`. Un plugin propio reemplaza `__APP_NOMBRE__` en `index.html`.
- Iconos generados por `scripts/generar-iconos.mjs` (portapapeles con visto amarillo, sin dependencias).
- Sin barras del navegador solo cuando está instalada; instalar exige HTTPS (salvo localhost). Sección del QR para admin y superadmin: menú Instalar la app > Código QR para instalar.

## Migración a SaaS (en curso)

Decisión: datos en Supabase (Postgres + PostgREST), una sola base con `empresa_id` y RLS; fotos siguen en Google Drive (carpeta por empresa > subcarpeta por usuario > subcarpeta por mes AAAA-MM; la tabla `drive_carpetas` guarda los ids de carpeta y solo la escribe el servidor; en la base solo `drive_id`, nombre y miniatura). Autenticación con Supabase Auth. Se hace por fases; el modo demo y la capa sin conexión se conservan.

- Fase 1 (hecha): `supabase/migrations/0001_esquema.sql` (tablas, triggers de sellado/numeración/bitácora/transiciones del técnico, RLS por rol, `registrar_empresa`). Prueba: `supabase/pruebas/preparar.sql` + `aislamiento.sql` en un Postgres de Docker (17 comprobaciones de aislamiento entre empresas y roles). El backend de Apps Script sigue siendo el activo hasta terminar las fases.
- Supabase local (Docker): `npm run supabase:local` genera `supabase/local/.env` (ignorado por git), levanta Postgres + GoTrue + PostgREST + nginx en `http://localhost:55321` (rutas `/rest/v1` y `/auth/v1`; base en el puerto 55322) y aplica las migraciones; imprime `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. `npm run supabase:probar` hace una prueba HTTP real (registro, empresa, aislamiento); `npm run supabase:detener` lo apaga (los datos quedan en el volumen). Otro proyecto usa 54321/54322: no tocarlos.
- Fase 2 (hecha): `src/supabase/transporte.js` implementa el contrato `call(action, payload)` sobre PostgREST/GoTrue con `@supabase/supabase-js`; traduce camelCase, usuarios por nombre de usuario (uuid internamente) y checklist como texto JSON. `api.js` elige el transporte: `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (Supabase) > `VITE_SCRIPT_URL` (Apps Script) > demo; la capa sin conexión funciona sobre cualquiera. Login con correo y clave; `LoginView` permite crear la empresa (`registrar`). `supabase/migrations/0002_reglas.sql` mueve a la base las reglas de `Code.gs` (informe finalizado, checklist completa, motivo de cancelación, técnico válido, clientes automáticos y no borrables con visitas, avisos, `crear_usuario`, `restablecer_clave`, `marcar_clave_cambiada`). `src/validarConfig.js` valida la configuración (demo y Supabase). Pruebas: `npm run supabase:probar` (humo HTTP, 43 comprobaciones del transporte y 18 de fotos contra el Supabase local; usa `supabase/local/registrar.mjs` para que Node resuelva imports sin extensión). En Supabase, el login de los usuarios creados por el superadmin es con su correo; el técnico no ve clientes. 
- Fase 3 (hecha, fotos): `apps-script-fotos/Code.gs` es un Apps Script aparte que solo mueve archivos en Drive (`ServiTec Fotos / Empresa (id) / usuario / AAAA-MM`). Usa el token Supabase del usuario (nunca una clave maestra): la base decide permisos, estado de la visita y el máximo de 25 fotos (`0003_fotos_drive.sql`: `foto_contexto`, `guardar_carpeta_drive`, `fotos_de_visita`, `empresas.zona_horaria` para el mes). Valida que las carpetas guardadas cuelguen de la esperada. El frontend lo usa con `VITE_FOTOS_URL` (`transporte.js`, `servicioFotos`); al eliminar una visita con fotos primero las manda a la papelera. Despliegue en `apps-script-fotos/README.md`. Prueba: `supabase/local/probar-fotos.mjs` (Drive simulado, base real), incluida en `npm run supabase:probar`.
- Fase 3b (pendiente): planes y límites por empresa, correos de recordatorio (reemplazo de los disparadores de `Code.gs`).
- Fase 4 (pendiente): migrar los datos de Sheets y retirar `Code.gs`.

## Pruebas

`apps-script/test/harness.js` simula Apps Script (SpreadsheetApp, CacheService, LockService, PropertiesService, MailApp, DriveApp, etc.) y ejecuta el `Code.gs` real. Suites: seguridad, flujo, rendimiento (20 000 informes: ~2,7 MB de lectura frente a ~226 MB antes de optimizar), notificaciones, offline, clientes, bitácora, configuración y pwa (detección de plataforma y lectura real de los QR con `jsqr`). `servidor-local.js` expone el mismo código por HTTP para probar el frontend completo.

## Despliegue pendiente y notas

- Falta publicar el frontend con HTTPS (GitHub Pages o Netlify) para que la instalación y el QR funcionen en celulares.
- El `Code.gs` publicado en Google debe actualizarse pegando el del repositorio y creando una nueva versión de la implementación.
- `.env` (con `VITE_SCRIPT_URL`) está en `.gitignore`; `dist`, `dist-local` y `node_modules` también.
- Git en Windows avisa de LF/CRLF: es normal.

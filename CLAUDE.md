# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# ServiTec: documentación del proyecto

App móvil (PWA) multiempresa para agendar visitas técnicas y crear informes (actividades, firma, fotos, PDF). Frontend Vue 3 + Vite + Tailwind v4; backend en Google Apps Script con Google Sheets como base de datos y Drive para las fotos. Repositorio: https://github.com/AntonioRomeroVelez/app-servitec (rama `main`). El detalle de uso y despliegue está en `README.md`.

La base de datos es Google Sheets (decisión del dueño, 26-11-2026). El código de Supabase sigue en el repositorio pero está en desuso (ver "Supabase").

## Reglas del usuario (obligatorias)

- Todo en español: respuestas, textos de la interfaz, mensajes de error, comentarios y documentación.
- Nunca emojis ni glifos como iconos: solo Lucide (`lucide-vue-next`).
- Todo campo de clave lleva botón mostrar/ocultar (`CampoClave.vue`).
- Cada registro queda a nombre de quien lo crea y la hoja Bitácora guarda quién hizo cada acción, con fecha `19-11-2026` y hora `14:13`.
- Menú: botón hamburguesa arriba a la izquierda, con botones y subbotones en cascada. No hay barra inferior.
- En computadora las vistas usan todo el ancho.
- Nunca subir `.env` ni claves al repositorio.

## Comandos

```bash
npm run dev            # servidor de desarrollo (vite --host)
npm run build          # compila a dist/ (genera service worker y manifiesto)
npm run preview        # sirve dist/
npm run test:gs        # todas las pruebas (node --test apps-script/test/*.test.js); hoy 186
node --test apps-script/test/empresas.test.js     # una sola suite
node --test --test-name-pattern="texto" apps-script/test/flujo.test.js   # una sola prueba
npm run servidor:local # Code.gs real sobre HTTP en el puerto 5400 (/__red?estado=off|on, /__hoja?nombre=...)
node scripts/generar-iconos.mjs                   # regenera los iconos de public/
```

- No hay linter.
- `api.js` elige el backend: `VITE_SUPABASE_URL` (tiene prioridad) > `VITE_SCRIPT_URL` > modo demo (localStorage; usuarios en la pantalla de ingreso). Para ver la app sin tocar ningún backend real, en Git Bash (PowerShell borra las variables vacías): `VITE_SCRIPT_URL= VITE_SUPABASE_URL= npx vite build --outDir dist-local` y `npx vite preview --outDir dist-local`. Contra el simulador: `VITE_SUPABASE_URL= VITE_SCRIPT_URL=http://127.0.0.1:5400 npm run dev`.
- `VITE_BASE=/subcarpeta/` al compilar si se publica en una subcarpeta.
- El puerto 5173 puede estar ocupado por otro proyecto: no matar procesos ajenos; usar otro puerto y cerrar solo los propios (en Windows, comprobar que el proceso realmente terminó).

## Roles (cuatro niveles)

| Rol | Qué hace |
| --- | --- |
| `root` (dueño del sistema, sin empresa; en la app "Root") | Solo crea empresas, las habilita o deshabilita y ve a sus superadministradores (usuario, clave temporal, restablecer). No personaliza ni edita datos ni ve el trabajo. |
| `superadmin` (uno por empresa; es el dueño del sistema dando soporte) | ÚNICO que cambia datos, logo, colores, informes y tipos de visita de su empresa. Crea y gestiona administradores. No trabaja con visitas, informes ni clientes. |
| `admin` | El propietario (primer admin que crea el superadmin; columna `propietario`, su cuenta solo la cambian él mismo y el superadmin) y los que él cree. Visitas, informes (también finalizados) y clientes; crea, edita, desactiva y elimina admins y técnicos; puede ser responsable de visitas. No ve superadmins ni cambia Ajustes. |
| `tecnico` | Ve las visitas asignadas; acepta, inicia, finaliza o cancela (`TRANSICIONES_TECNICO`), crea sus informes y sube fotos desde que acepta. |

- Alta de empresa (root): nombre, ciudad, cédula, correo y teléfono. Usuario del superadmin: primera palabra del nombre (`usuarioDeEmpresa_`). Clave temporal: **la cédula del root** (decisión del dueño, advertido de que todas las empresas la conocen); sale de su fila o de la propiedad `SUPERADMIN_CEDULA`.
- Alta de usuario: nombres completos, cédula ecuatoriana, correo, teléfono y ciudad; la clave temporal es su cédula. Las reglas de `persona.js` / `utils.js` se repiten en `Code.gs`. El usuario de ingreso es único en toda la plataforma.
- Cédula, correo y teléfono no se repiten dentro de una empresa, salvo entre el superadmin y el propietario (`sinDatosRepetidos_`).
- Las claves van con hash: nunca se pueden consultar; solo se muestra la temporal mientras no la cambien.
- Eliminar un usuario solo marca `eliminado` (el nombre de usuario no se reutiliza) y se impide si tiene visitas pendientes.

## Arquitectura

### Datos: una hoja y una carpeta por empresa

```
Hoja principal (la que tiene el script): Empresas (con hojaId y carpetaId), Usuarios, Bitácora de lo que no es de ninguna empresa
ServiTec - Empresas/ Nombre de la empresa/
  ServiTec - Nombre            -> Visitas, Informes, Fotos, Clientes, Notificaciones, Bitácora, Configuración
  Nombre (usuario)/ AAAA-MM/   -> fotos (JPEG de hasta 1280 px, objetivo 200 KB: comprimirImagen)
```

- `tabla_` elige el libro según `EMPRESA_ACTUAL` (la de la sesión); para otra empresa usar `enEmpresa_(id, fn)`. Las tablas globales llevan `global: true`. `empresaId`, `autor` y `modificadoPor` los pone siempre el servidor; lo que envíe el cliente se ignora.
- Las columnas se leen por posición: las nuevas van **al final** y `completarColumnas_` las agrega a hojas existentes. En las tablas con columnas pesadas (`ligeras`), `leer_` trae `empresaId` aparte.
- `migrarEmpresas_` (al primer acceso) convierte una hoja antigua: designa al root y copia los datos a la hoja de la primera empresa sin borrar el original.

### Backend: `apps-script/Code.gs`

- `doPost` con acciones; `handle_` despacha por rol (`accionesRoot_`, `accionesSuperadmin_` y el resto para admin y técnico). Una acción nueva debe permitirse en el despacho de cada rol que la use.
- `conCache_` guarda la respuesta de `dashboard_resumen` y de los listados de visitas, informes y clientes (120 s); toda acción que no esté en `ES_LECTURA` estrena versión al terminar. Una escritura nueva fuera de `doPost` debe llamar a `olvidarDatos_`.
- Lecturas con `CacheService` (usuarios, empresas, tokens `t_`, bloqueo `f_`, configuración). `LockService` solo en escrituras: las lecturas van en la regex `ES_LECTURA`. Creaciones idempotentes con UUID del cliente.
- Sesión `idUsuario:versionSesion`; hash `v2:` (SHA-256 × 600 con sal); bloqueo tras intentos fallidos; cambio de clave obligatorio. Una empresa deshabilitada corta el acceso a sus usuarios.
- Los textos que empiezan por `= + - '` se guardan con apóstrofo para que Sheets no los tome como fórmula.
- Funciones del editor: `crearSuperadmin` (crea el root; propiedades `SUPERADMIN_USUARIO`, `SUPERADMIN_CLAVE`, `SUPERADMIN_CEDULA`, `SUPERADMIN_NOMBRE`), `aplicarFormatos`, `diagnosticoUsuarios`, `registrarClientesExistentes`, `instalarTriggers` (recordatorios 18:00 y limpieza 03:00). Si la hoja está vacía, el primer ingreso crea un root genérico con clave pública (ver README): ejecutar antes `crearSuperadmin`.
- `CONFIG_DEFECTO` debe coincidir con `src/configuracion.js` (hay una prueba).

### Cambiar o agregar una función

1. `Code.gs` (reglas y permisos) y el modo demo en `src/api.js`.
2. Si debe funcionar sin conexión: `ES_LECTURA` o `ENCOLABLES` en `src/offline/capa.js`, y revisar `overlay.js`.
3. Prueba en `apps-script/test/`.
4. Publicar: pegar `Code.gs` en el script de la hoja principal y crear una **nueva versión** de la implementación. Sin ese paso el frontend nuevo falla contra el script viejo.

El modo demo no tiene empresas ni root: usa un superadmin y un admin locales.

### Frontend: `src/`

- `App.vue`: sin router (ref `vista`), menú según rol (`arbol`); root y superadmin (`sinOperacion` de `useAuth`) no cargan visitas, informes ni avisos.
- Carga: `call(accion, datos, { previo })` entrega primero la copia guardada y comparte las lecturas iguales en curso; `BarraCarga.vue` se muestra mientras haya consultas (`carga.js`) y cada vista usa `Cargando.vue` hasta tener datos.
- `offline/`: IndexedDB, cola de cambios con ids generados en el cliente y sincronización automática.
- Diseño común a todas las vistas: crear con `BotonNuevo.vue` (flotante; es el único uso del color de acento en botones); acción principal `btn`, secundaria `btn-borde`, discreta `btn-texto`; en tarjetas, una acción principal y el resto como `btn-icono` con `aria-label`. Vacíos con `Vacio.vue`, carga con `Cargando.vue`, errores con `aviso-error` y formularios con `PieFormulario.vue` (Cancelar y Guardar fijos abajo).
- Confirmaciones con `confirmar()` (`useConfirmar.js`) en toda acción que cambia o borra; avisos con `useToast.js`. No usar `confirm()` ni `alert()`.
- Listas: `BarraFiltros.vue` y `Paginador.vue`; se reparten en columnas con `lg:grid-cols-[repeat(auto-fit,minmax(24rem,1fr))]`. Tarjetas con `Dato.vue`, `Avatar.vue` y `bordeDeEstado` (`estados.js`).
- Altas en `Modal.vue`, siempre a pantalla completa; el contenido es un `form` o `div` y sus botones van en `pie-fijo` o `PieFormulario.vue`; en computadora los campos se reparten en columnas (se cierra con X o Escape, no al tocar el fondo; con ventanas apiladas, Escape cierra solo la de encima).
- Todo formulario nuevo se registra con `useSinGuardar` (`composables/useSinGuardar.js`): sus botones de cerrar usan `salir()` y la navegación de `App.vue` usa `puedeSalir()`, que preguntan «¿Salir sin guardar?» solo si hay cambios.
- Informe (`FormInforme.vue`): empieza con dos actividades vacías; los dos primeros ítems del tipo de visita solo son texto de ayuda. Resultados Cumple / No cumple / Falla (`na` solo en informes antiguos). Para finalizar, al menos una actividad, y cada una con descripción y resultado (los finalizados antiguos sin actividades se pueden seguir corrigiendo). Se guarda como JSON en `checklist`. La firma se dibuja en `FirmaModal.vue` y se guarda recortada como PNG pequeño.
- PDF: `pdfInforme.js` (jsPDF, carga diferida), con los datos y colores de la empresa y las opciones de Ajustes; `informeEjemplo.js` genera la vista previa.
- Mapa (`mapa.js`, `MapaModal.vue`): Leaflet + OpenStreetMap, gratis y sin clave (decisión del dueño); el punto va en la columna `ubicacion` de `Visitas` ("lat,lng", validado también en `Code.gs`, `asegurarUbicacion_` completa hojas antiguas). Nominatim: máximo 1 consulta por segundo y sin autocompletar.
- WhatsApp (solo enlace `wa.me`, sin API de Meta por decisión del dueño): plantillas por empresa que administra su superadmin; envían y ven el historial solo los administradores; el estado es `Preparado` o `Fallido`, nunca «enviado». Reglas en `whatsapp.js` y repetidas en `Code.gs` (`whatsapp_`, hay pruebas de que coinciden); modo demo en `whatsappDemo.js`. Hojas `Plantillas WhatsApp` y `Envíos WhatsApp` por empresa (se crean solas) y sección `whatsapp` de la configuración. Los emojis van solo dentro del mensaje.
- Marca: `tema` = `{ primario, acento, encabezado, fondo }`; imágenes en las secciones `logo`, `logoClaro`, `fondoImagen` (data URL de hasta 45.000 caracteres: una celda). Piezas: `tema.js` (paleta, `--color-encabezado`, `estiloFondo`), `colores.js` (colores desde el logo), `VistaPreviaMarca.vue`. Antes de ingresar, `configuracion_get { empresa }` entrega solo la marca (`marcaPublica_`); el dispositivo recuerda la empresa del enlace `?empresa=` o del último ingreso.
- Estilos: Tailwind v4 con `@theme` y `@utility` (`campo`, `etiqueta`, `btn`, `btn-borde`, `btn-peligro`, `btn-acento`, `tarjeta`). No usar `@apply` con clases propias.

### PWA

`vite.config.js` usa `vite-plugin-pwa` (`generateSW`, `autoUpdate`); el manifiesto (nombre e iconos) es igual para todas las empresas. Instalar exige HTTPS (salvo localhost).

## Pruebas

`apps-script/test/harness.js` simula Apps Script (varias hojas de cálculo, Drive, caché, locks, correo) y ejecuta el `Code.gs` real; `ayudas.js` arma root, empresa, superadmin, propietario y equipo (`entornoListo`, `conEmpresa`). Algunas suites prueban funciones puras del frontend (PDF, imágenes, marca, PWA). No se prueba contra Google real ni hay pruebas de interfaz: los cambios visuales se revisan en el navegador con la compilación de demostración.

## Despliegue

- Vercel (Vite, `npm run build`, salida `dist`). Variable de entorno: `VITE_SCRIPT_URL` (URL `/exec` del script de la hoja principal). No definir `VITE_SUPABASE_URL`. Las `VITE_*` se leen al compilar: tras cambiarlas hay que volver a desplegar. Un `push` a `main` publica.
- Apps Script: implementación como aplicación web, ejecutar como "Yo", acceso "Cualquier persona".
- Las hojas de las empresas no se editan a mano (no mover, ordenar ni borrar columnas o filas).
- Git en Windows avisa de LF/CRLF: es normal.

## Supabase (en desuso)

`supabase/`, `src/supabase/transporte.js`, `apps-script-fotos/` y los comandos `npm run supabase:*` pertenecen a la versión anterior. No siguen las reglas actuales (roles, empresas, informes) y no hay que mantenerlos salvo que el dueño lo pida. La documentación de esa etapa está en el historial de este archivo (commit `4a1702d`). Si se tocan: `db push` necesita `--remote` (sin él apunta a una base local de otro proyecto) y nunca se usa la `service_role` en el frontend ni se piden claves en el chat.

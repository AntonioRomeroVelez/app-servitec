# ServiTec

**ServiTec** (de *servicio técnico*) es la app de visitas e informes técnicos. El nombre de la empresa que la usa (Ferisel u otra) se personaliza en Ajustes; el nombre del producto vive en `src/app.js` y de ahí sale el título de la página, el nombre de la app instalada en el celular y el texto de la pantalla de ingreso.

App mobile-first para **agendar visitas** y **crear informes** (cada informe puede vincularse a su visita). Vue 3 (Composition API, `<script setup>`) + Vite + Tailwind CSS v4 + iconos de Lucide (`lucide-vue-next`; no se usan emojis). Es una **PWA**: se puede instalar en el celular y abre sin conexión. Los datos se guardan en Google Sheets a través de un Google Apps Script.

## Desarrollo

```bash
npm install
cp .env.example .env   # opcional: sin VITE_SCRIPT_URL funciona en modo demo (localStorage)
npm run dev
npm run build
```

En modo demo hay tres usuarios: `superadmin` / `superadmin123`, `admin` / `admin123` y `tecnico` / `tecnico123`.

## Roles

| Rol | Permisos |
| --- | --- |
| `tecnico` | Ve solo las visitas que le **asignaron**. Las **acepta** o **cancela** (con motivo), las inicia y las finaliza, y crea informes (ve solo los suyos). No agenda, edita ni elimina visitas. |
| `admin` | Agenda visitas y las asigna a un técnico. Ve, edita y elimina las que agendó, y ve los informes de esas visitas y los propios. |
| `superadmin` | Ve y gestiona **todas** las visitas e informes y administra usuarios (crear, cambiar clave, activar/desactivar). |

## Conectar con Google Sheets

1. Crea una hoja de cálculo en Google Sheets.
2. **Extensiones → Apps Script** y pega el contenido de `apps-script/Code.gs`.
3. **Implementar → Nueva implementación → Aplicación web**: ejecutar como *Yo*, acceso *Cualquier persona*.
4. Copia la URL (`.../exec`) a `.env` como `VITE_SCRIPT_URL=...` y reinicia `npm run dev`.
5. Las hojas `Visitas`, `Informes` y `Usuarios` se crean solas. En el primer login se crea el superadmin inicial definido en `SUPERADMIN_INICIAL` (`superadmin` / `Ferisel2026!`). Es una clave **temporal**: la app obliga a cambiarla antes de dejar usar nada.

Si cambias `Code.gs`, crea una **nueva versión** de la implementación.

## Estructura

- `src/api.js`: transporte único (`call(action, payload)`) hacia Apps Script, o localStorage en modo demo. Ambos lados deben mantenerse en espejo.
- `src/composables/`: `useAuth` (sesión), `useRecurso` (fábrica CRUD) con `useVisitas` y `useInformes`, `useUsuarios`.
- `src/views/`: login, agenda y detalle/formulario de visitas, lista/detalle/formulario de informes y usuarios. `App.vue` navega por estado, sin router.
- `apps-script/Code.gs`: backend con autenticación por token (CacheService, 6 h), claves con hash SHA-256 + salt y control de permisos por rol.
- `src/style.css`: paleta de marca (`brand-*`, `acento`) en `@theme` y clases reutilizables (`.campo`, `.btn`, `.tarjeta`).

Para añadir un campo a un informe o visita: agrégalo a `headers` en `Code.gs` y al formulario/detalle correspondiente. Si es un campo corto va antes de las columnas pesadas y hay que subir `ligeras` en 1; si es largo (texto libre, imágenes) va al final. En una hoja que ya tiene datos, cambiar el orden de columnas exige migrarlos: el código lee por posición.

## Seguridad del acceso

- **Bloqueo por intentos:** 5 fallos seguidos con un mismo usuario lo bloquean 15 minutos (también con la clave correcta). Cuenta igual para usuarios que no existen, así no se revela cuáles existen. Un superadmin puede levantar el bloqueo restableciendo la clave.
- **Clave temporal:** el superadmin inicial, los usuarios nuevos y las claves restablecidas deben cambiarse en el primer ingreso. El backend rechaza cualquier otra acción (`CAMBIAR_CLAVE`) hasta que se cambie; no depende de la pantalla.
- **Política de claves:** mínimo 10 caracteres, con letras y números, sin contener el nombre de usuario.
- **Sesiones:** al cambiar o restablecer una clave se cierran las demás sesiones de ese usuario. "Salir" invalida el token también en el servidor.
- **Hash:** SHA-256 con sal propia y 600 rondas (`HASH_RONDAS` en `Code.gs`). Si el login se siente lento en Apps Script, baja ese valor.
- **Lock del script:** solo las escrituras toman el lock; el login y las consultas no esperan a otras operaciones.

Cualquier usuario puede cambiar su clave desde el menú: **Mi cuenta → Cambiar mi clave**. Todos los campos de clave tienen un botón para mostrar u ocultar lo escrito (`CampoClave.vue`); restablecer la clave de otro usuario se hace en un formulario dentro de su tarjeta, no con cuadros de diálogo del navegador.

**Si ya habías creado hojas con una versión anterior**, bórralas antes de usar esta versión para que se recreen solas con el orden de columnas actual (las columnas pesadas van al final y cada registro guarda quién lo creó y quién lo modificó): `Visitas`, `Informes`, `Fotos` y `Notificaciones`. Se pierden los datos de prueba que tuvieran. **No borres `Usuarios`** (ahí están tus usuarios); esa hoja no cambió. Se crean además `Clientes` y `Bitácora`. Si prefieres conservar datos en una hoja con el orden de columnas correcto, ejecuta `aplicarFormatos` (ver más abajo).

**Crear el primer superadmin sin usar la clave genérica.** Antes del primer ingreso, en Apps Script define las propiedades de la secuencia de comandos (Configuración del proyecto) `SUPERADMIN_USUARIO`, `SUPERADMIN_CLAVE` (temporal) y, si quieres, `SUPERADMIN_NOMBRE`, y ejecuta la función `crearSuperadmin`. Crea ese usuario (con cambio de clave obligatorio al ingresar), evita que se genere el `superadmin` con clave pública y borra la clave de las propiedades. Nada de esto queda escrito en el código. Si un usuario no logra entrar, `diagnosticoUsuarios` explica por qué sin mostrar claves.

## Ajustes: personalizar la app (superadmin)

La pestaña **Ajustes** (solo superadmin) permite personalizar la app sin tocar código. Los cambios se guardan en la hoja `Configuración` y los ven todos los usuarios de inmediato; cada cambio queda en la bitácora.

| Sección | Qué se puede cambiar |
| --- | --- |
| **Datos de la empresa** | Nombre, subtítulo o eslogan, RUC, dirección, teléfono, correo, sitio web y el pie de los informes. Salen en la pantalla de ingreso, en el encabezado y pie del PDF y en los correos. |
| **Colores y logo** | Color principal (botones, encabezado) y de acento; de ahí se calcula toda la paleta. Hay combinaciones predefinidas y vista previa en vivo en toda la app antes de guardar. El logo se sube (PNG, JPG, WebP o SVG) y se reduce solo; aparece en el ingreso y en el PDF. |
| **Informes** | Prefijo del número (`INF`, `FER`... de 2 a 6 letras o números) y qué incluye el PDF: checklist, observaciones, fotos y firma. |
| **Tipos de visita y checklists** | Agregar, renombrar, ordenar y quitar tipos (hasta 12) y los ítems de checklist de cada uno (hasta 30). El checklist del tipo se carga solo al crear un informe. |

Cada sección tiene su botón de **valores de fábrica**. Notas:

- **Legibilidad.** El color principal debe permitir leer texto blanco (contraste mínimo 4,5): si es demasiado claro, la app lo avisa y no deja guardar. El color del texto sobre el acento se calcula solo.
- **Lo ya registrado no cambia.** Cambiar o quitar un tipo de visita, o el prefijo, no modifica visitas ni informes existentes (conservan su tipo y su número); el correlativo del número se lleva por prefijo y año.
- **La lectura de la configuración es pública** (la necesita la pantalla de ingreso antes de iniciar sesión) y solo contiene datos de marca. Modificarla exige ser superadmin y se valida en el servidor.
- Se guarda una copia en el dispositivo: la marca aparece al instante y también sin conexión.
- El nombre y los iconos de la app **instalada** en el celular (manifiesto) son fijos; cambian al volver a instalarla con una versión nueva. Para cambiar los iconos edita `scripts/generar-iconos.mjs` y vuelve a generarlos.
- La hoja `Configuración` se crea sola. Si prefieres editarla a mano, cada fila es una sección (`empresa`, `tema`, `logo`, `informes`, `tipos`) con su valor en JSON; un valor dañado se ignora y se usa el de fábrica.

## Clientes

Al registrar una visita, el cliente se registra solo en la hoja `Clientes` (nombre, dirección y teléfono). No se duplica aunque se escriba distinto (`Banco del Sur`, `banco  del sur`, `BANCO DEL SÚR` son el mismo cliente); si ya existía, solo se completan la dirección y el teléfono que estuvieran vacíos. Cada visita queda vinculada a su cliente (`clienteId`).

- **Al agendar una visita**, el campo Cliente sugiere los clientes ya registrados mientras se escribe; al elegir uno se completan su dirección y teléfono, y la app avisa si es un cliente registrado o uno nuevo que se registrará al guardar.
- **Pantalla Clientes** (admin y superadmin): búsqueda por nombre, teléfono o dirección; alta manual; edición; botón **Agendar visita** que abre el formulario con los datos del cliente; y sus últimas visitas. Cambiar el nombre de un cliente no reescribe las visitas ya registradas. Solo el superadmin elimina, y solo clientes sin visitas. Los técnicos no ven el catálogo.
- Si ya tenías visitas antes de existir el catálogo, ejecuta una vez `registrarClientesExistentes` desde el editor de Apps Script: registra sus clientes y las vincula.

## Bitácora y formato de fechas

La hoja `Bitácora` guarda un renglón por cada acción, con quién la hizo y cuándo:

| fecha | hora | usuario | rol | accion | detalle |
| --- | --- | --- | --- | --- | --- |
| 19-11-2026 | 14:13 | carlos | tecnico | Visita modificada | Banco del Sur (19-11-2026 09:00) — Estado: de Programada a Aceptada |

Se registran: inicios de sesión, cambios y restablecimientos de clave, altas y cambios de usuarios, visitas, informes (creados, modificados, finalizados y eliminados), clientes, fotos, el bloqueo por intentos fallidos (una vez por bloqueo, no cada intento) y lo que hace el sistema (recordatorios y limpieza de avisos). El detalle muestra el antes y el después de lo que cambió; en los campos largos (observaciones, checklist, firma) solo indica que cambiaron.

Además, cada registro guarda **quién lo creó** (`autor`) y **quién lo modificó por última vez** (`modificadoPor`). Las fechas y horas (`creado`, `actualizado` y la fecha de las visitas e informes) son **fechas reales de Sheets** con formato `19-11-2026` y `19-11-2026 14:13`, así que se pueden ordenar y filtrar. La hora de cada visita sigue siendo texto `HH:mm`. La app no cambia: sigue recibiendo las fechas como siempre.

Las horas se muestran en la zona horaria de la hoja; el script la deja igual a la del proyecto (`America/Guayaquil`) al crear las hojas. Si conservas hojas anteriores, ejecuta una vez `aplicarFormatos`: aplica el formato, convierte el texto que ya hubiera en esas columnas a fechas reales y alinea la zona horaria. La bitácora no se borra sola (es un registro de auditoría); crece unas pocas filas por acción.

## Notificaciones

Cada aviso se muestra en la app (campana del encabezado, con contador de no leídos) y, si el usuario tiene correo registrado, también se envía por correo. Se crean cuando:

| Evento | Quién recibe el aviso |
| --- | --- |
| Se agenda o se **reasigna** una visita | el técnico asignado (y el anterior, si hubo cambio) |
| Se **reprograma** (fecha, hora o dirección) o el admin la **cancela** | el técnico asignado |
| El técnico **acepta, rechaza, inicia o finaliza** una visita | el admin que la agendó (el rechazo incluye el motivo) |
| Se **finaliza un informe** de una visita | el admin que agendó la visita |
| **Recordatorio diario** (18:00) | cada técnico con visitas mañana; el admin si una visita de mañana no tiene técnico |

Quien hace la acción no recibe su propio aviso. Tocar un aviso abre la visita o el informe.

**Puesta en marcha**

1. El superadmin registra el correo de cada usuario en **Usuarios → Correo** (opcional; sin correo solo hay avisos dentro de la app).
2. En Apps Script, **Configuración del proyecto → Zona horaria**: `America/Guayaquil`, para que "mañana" y las 18:00 sean los de Ecuador.
3. Ejecuta **una vez** la función `instalarTriggers` desde el editor (Google pide autorizar el envío de correos). Crea el recordatorio diario y la limpieza nocturna de avisos de más de 60 días. Repetirla no duplica nada.
4. Opcional: pon la URL pública de la app en `APP_URL` (`Code.gs`) para que los correos lleven un botón "Abrir la app".
5. Crea una **nueva versión** de la implementación (hay un permiso nuevo: enviar correo).

Límites: Apps Script no puede enviar notificaciones push; la app consulta un resumen liviano cada minuto mientras está visible. Cuota de correo: unos 100 por día con una cuenta Gmail personal y unos 1.500 con Google Workspace; si se agota, los avisos dentro de la app siguen funcionando. Los correos se envían después de guardar, sin retener el lock, y un fallo de correo nunca impide la operación.

## Modo sin conexión

La app se instala en el celular (Chrome: menú → *Instalar app* / *Añadir a la pantalla de inicio*; en iPhone, Safari → *Compartir* → *Añadir a pantalla de inicio*) y abre aunque no haya internet. Requiere HTTPS para instalarse (`localhost` también sirve para probar).

**Sin conexión se puede**: ver la agenda, las visitas y los informes que ya se habían abierto, **cambiar el estado de una visita** (aceptar, iniciar, finalizar, cancelar), **crear y editar informes** (checklist y firma incluidos) y **tomar fotos**. Lo hecho queda marcado "Sin enviar" y la barra superior muestra cuántos cambios esperan.

**Al volver la conexión** se envían solos, en el mismo orden en que se hicieron (cada 30 segundos o en cuanto el navegador detecta la red), y la app se actualiza. Si el servidor rechaza alguno (por ejemplo, un estado que ya no se puede aplicar), queda en **Cambios pendientes** (toca la barra) con el motivo, y se puede reintentar o descartar sin bloquear al resto.

**Requiere conexión**: iniciar sesión, usuarios y claves, eliminar visitas, buscar informes que no se habían cargado y ver informes o fotos completas que nunca se abrieron.

Cómo está hecho (`src/offline/`): el service worker guarda la app; IndexedDB guarda la última respuesta de cada lectura y la cola de cambios. **El cliente genera los identificadores** de visitas, informes y fotos, y el servidor los acepta: si una petición se repite (se perdió la respuesta, reintento) no se duplica nada ni se gasta otro número de informe. El número de informe lo asigna el servidor al recibirlo, por eso un informe creado sin conexión muestra "número pendiente".

Privacidad y límites: al cerrar sesión se borran las copias guardadas (pueden ser datos de clientes), pero los cambios pendientes se conservan para enviarlos al volver a entrar. Una foto pendiente ocupa unos 0,3–0,5 MB en el dispositivo. Si dos personas editan lo mismo, gana el último cambio que llegue al servidor; lo único que el servidor rechaza es lo que sus reglas no permiten (estados inválidos, informes ya finalizados). Safari en iPhone puede borrar los datos de sitios que no se usan en varias semanas: conviene instalar la app y abrirla con regularidad.

## Probar sin publicar nada en Google

`apps-script/test/servidor-local.js` ejecuta el `Code.gs` real dentro del simulador y lo expone por HTTP, con datos de ejemplo:

```bash
npm run servidor:local                          # http://127.0.0.1:5400 (usuarios y claves se imprimen al iniciar)
VITE_SCRIPT_URL=http://127.0.0.1:5400 npm run dev
```

Para probar el modo sin conexión: `GET /__red?estado=off` hace que las peticiones fallen como si se cayera la conexión, y `?estado=on` la devuelve. Los datos viven en memoria. El service worker solo está activo en la versión compilada (`npm run build` y `npm run preview`), no en `npm run dev`.

## Rendimiento con muchos registros

Google Sheets se vuelve lento por **cuánto se lee** en cada petición, así que el backend está diseñado para leer lo mínimo:

- **Columnas pesadas al final** de cada hoja (`descripcion`, `checklist`, `firma` en Informes; `mini` en Fotos). Los listados leen solo las columnas livianas (`ligeras` en `Code.gs`); las pesadas se leen únicamente al abrir un registro (`informes_get`).
- **Buscar por id** lee solo la columna `id` y luego una fila; nunca la hoja completa.
- **Informes paginados** (50 por página, máx. 100) con búsqueda y filtro por estado en el servidor. **Visitas por ventana de fechas**: se cargan los últimos 14 días y todo lo futuro, y "Cargar visitas anteriores" trae más de 30 en 30.
- **Usuarios en caché** (5 min, se invalida al modificarlos desde la app): validar la sesión ya no lee ninguna hoja. Un cambio hecho a mano en la hoja `Usuarios` puede tardar hasta 5 minutos en notarse.
- **Solo las escrituras toman el lock** del script.

Medido en el simulador con 20.000 informes (cada uno con firma, checklist y observaciones) y 10.000 visitas:

| Operación | Antes (estimado) | Ahora |
| --- | --- | --- |
| Listado de informes | ~226 MB leídos y devueltos | ~2,7 MB leídos, 15 KB devueltos |
| Abrir un informe | leía toda la hoja | columna `id` + 1 fila (~0,1 MB) |
| Cambiar el estado de una visita | leía toda la hoja | columna `id` + 1 fila |
| Validar sesión / login | leía la hoja de usuarios | 0 celdas (caché) |

Límites a tener presentes: cada listado todavía recorre las columnas livianas de toda la hoja (260.000 celdas con 20.000 informes), así que el diseño aguanta bien decenas de miles de filas, no cientos de miles. La latencia real depende de Google y no se puede medir en el simulador; además Apps Script tiene cuotas diarias y un máximo de 6 minutos por ejecución. Si el volumen se acerca a ese límite, lo siguiente es archivar los años anteriores en otra hoja o pasar a una base de datos (Supabase o Firebase); como todo el acceso a datos pasa por `src/api.js` y `Code.gs`, el cambio queda acotado.

No insertes ni reordenes columnas en las hojas, ni ordenes las filas a mano: el código lee por posición.

## Pruebas del backend

`apps-script/test/` contiene un simulador de Apps Script (hojas, caché, locks y Drive en memoria) y pruebas de la lógica de `Code.gs`:

```bash
npm run test:gs
```

Son 98 pruebas: login, bloqueo y cambio obligatorio de clave, permisos por rol, flujo de estados, informes (numeración y cierre), fotos y carpetas de Drive, paginación, notificaciones y correos, recordatorios, idempotencia, clientes, bitácora y formatos de fecha, configuración y colores, el modo sin conexión completo (capa real + IndexedDB simulado + red que se corta o pierde respuestas) y una prueba de escala con 20.000 informes que imprime cuántas celdas lee cada operación. No miden la latencia real de Google; sirven para comprobar la lógica sin publicar el script.

## Informes

- **Número correlativo** por año (`INF-2026-0001`), asignado por el backend.
- **Checklist por tipo de visita** (`src/plantillas.js`): cada ítem se marca Cumple / Falla / N/A; una falla exige observación. Se guarda como JSON en la columna `checklist`.
- **Firma del cliente** (dibujada en pantalla, PNG pequeño) y nombre de quien recibe.
- **Finalizado = cerrado:** para finalizar hay que responder todo el checklist. Después solo el superadmin puede editarlo o eliminarlo (se valida en `Code.gs`).
- **PDF:** el botón "Descargar PDF" genera y descarga un archivo A4 (`INF-0001.pdf`) con el logo y los datos de la empresa como encabezado, checklist, observaciones, fotos de la visita, firma del cliente y pie con numeración de páginas. Lo que incluye se elige en Ajustes > Informes.

## Fotos de las visitas

Desde el detalle de una visita se pueden agregar fotos (cámara o galería). Antes de subirlas, el dispositivo las reduce a un máximo de 1600 px por lado y las re-codifica en JPEG (típicamente 150-400 KB), de modo que el texto y los detalles siguen siendo legibles.

En Drive se guardan así, en el Drive de la cuenta que publica el script:

```
Informes Ferisel - Fotos/
  └─ Nombre (usuario)/        ← una carpeta por administrador y por técnico (quien sube la foto)
       └─ 2026-11/            ← mes de la visita
            └─ 2026-11-19_cliente_a1b2c3.jpg
```

- Las fotos son **privadas** en Drive (no se comparten por enlace). La app las muestra mediante el script, respetando los permisos de cada rol.
- Las miniaturas se guardan en la hoja `Fotos` junto con el ID del archivo en Drive.
- Máximo 25 fotos por visita. El técnico puede subir fotos una vez aceptada la visita. Solo quien subió una foto o el superadmin puede eliminarla (va a la papelera de Drive).
- Al eliminar una visita, sus fotos se envían a la papelera de Drive (recuperables) y se borran sus registros de la hoja `Fotos`.
- **La primera vez** que publiques el script con esta versión, Google pedirá autorizar el acceso a Drive: ejecuta cualquier función desde el editor (o crea la implementación) y acepta los permisos.
- En modo demo las fotos se guardan en el navegador (espacio limitado).

Estados de visita: `Programada → Aceptada → En curso → Realizada`; `Cancelada` exige un motivo. El técnico solo puede avanzar en ese orden o cancelar, y crea informes una vez aceptada la visita. Admin/superadmin pueden poner cualquier estado.


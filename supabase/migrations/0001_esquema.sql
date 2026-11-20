-- ServiTec SaaS: esquema PostgreSQL para Supabase (PostgREST).
-- Una sola base; cada fila lleva empresa_id y Row Level Security aísla a las empresas.
-- Autenticación: Supabase Auth (auth.users). Cada usuario tiene un perfil con empresa y rol.
-- Fotos: el archivo vive en Google Drive (carpeta de la empresa > subcarpeta del usuario);
-- aquí solo se guarda drive_id, nombre y una miniatura pequeña.
-- Estructura en Drive: carpeta de la empresa > subcarpeta del usuario > subcarpeta del mes (AAAA-MM).

create schema if not exists app;

-- ---------------------------------------------------------------- tablas

create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) > 0),
  plan text not null default 'prueba' check (plan in ('prueba', 'basico', 'pro')),
  activa boolean not null default true,
  drive_carpeta_id text,                       -- carpeta raíz de la empresa en Drive
  creado timestamptz not null default now()
);

create table public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  usuario text not null check (length(trim(usuario)) > 0),
  nombre text not null,
  rol text not null check (rol in ('superadmin', 'admin', 'tecnico')),
  correo text,
  activo boolean not null default true,
  cambiar_clave boolean not null default true,  -- cambio obligatorio en el primer ingreso
  drive_carpeta_id text,                        -- subcarpeta del usuario en Drive
  creado timestamptz not null default now(),
  unique (empresa_id, usuario)
);
create index on public.perfiles (empresa_id);

create table public.configuracion (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  clave text not null,                          -- empresa, tema, logo, informes, tipos
  valor jsonb not null,
  modificado_por uuid references public.perfiles (id) on delete set null,
  actualizado timestamptz not null default now(),
  primary key (empresa_id, clave)
);

create table public.clientes (
  id uuid primary key default gen_random_uuid(),   -- el cliente puede enviar su propio uuid (idempotencia)
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nombre text not null,
  direccion text not null default '',
  telefono text not null default '',
  autor uuid references public.perfiles (id) on delete set null,
  creado timestamptz not null default now(),
  modificado_por uuid references public.perfiles (id) on delete set null,
  actualizado timestamptz not null default now()
);
create index on public.clientes (empresa_id, lower(nombre));

create table public.visitas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  fecha date not null,
  hora time not null,
  cliente text not null,
  cliente_id uuid references public.clientes (id) on delete set null,
  direccion text not null default '',
  telefono text not null default '',
  tipo text not null,
  responsable uuid not null references public.perfiles (id),
  estado text not null default 'Programada'
    check (estado in ('Programada', 'Aceptada', 'En curso', 'Realizada', 'Cancelada')),
  notas text not null default '',
  motivo text not null default '',               -- motivo de cancelación
  autor uuid references public.perfiles (id) on delete set null,
  creado timestamptz not null default now(),
  modificado_por uuid references public.perfiles (id) on delete set null,
  actualizado timestamptz not null default now()
);
create index on public.visitas (empresa_id, fecha);
create index on public.visitas (empresa_id, responsable, fecha);

create table public.informes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  visita_id uuid references public.visitas (id) on delete set null,
  numero text not null,                          -- INF-0001, lo asigna el trigger
  fecha date not null,
  cliente text not null,
  titulo text not null default '',
  tipo text not null default '',
  estado text not null default 'Borrador' check (estado in ('Borrador', 'Finalizado')),
  responsable uuid references public.perfiles (id) on delete set null,
  firmante text not null default '',
  descripcion text not null default '',
  checklist jsonb not null default '[]',
  firma text not null default '',                -- imagen de la firma (data URL pequeña)
  autor uuid references public.perfiles (id) on delete set null,
  creado timestamptz not null default now(),
  modificado_por uuid references public.perfiles (id) on delete set null,
  actualizado timestamptz not null default now(),
  unique (empresa_id, numero)
);
create index on public.informes (empresa_id, fecha desc);
create index on public.informes (visita_id);

create table public.fotos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  visita_id uuid not null references public.visitas (id) on delete cascade,
  drive_id text not null,
  mes text not null default to_char(now(), 'YYYY-MM') check (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),  -- subcarpeta mensual donde quedó
  nombre text not null default '',
  mini text not null default '',                 -- miniatura base64 pequeña
  autor uuid references public.perfiles (id) on delete set null,
  creado timestamptz not null default now()
);
create index on public.fotos (visita_id);

-- Caché de carpetas de Drive: una por empresa, usuario y mes. Solo la escribe la función de servidor
-- (service role); la app no la lee, por eso no tiene políticas para authenticated.
create table public.drive_carpetas (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  usuario_id uuid not null references public.perfiles (id) on delete cascade,
  mes text not null check (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  drive_id text not null,
  primary key (empresa_id, usuario_id, mes)
);

create table public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  usuario_id uuid not null references public.perfiles (id) on delete cascade,
  tipo text not null,
  titulo text not null,
  mensaje text not null default '',
  ref text not null default '',
  leida boolean not null default false,
  creado timestamptz not null default now()
);
create index on public.notificaciones (usuario_id, creado desc);

create table public.bitacora (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  momento timestamptz not null default now(),    -- se muestra como 19-11-2026 y 14:13 en la app
  usuario_id uuid references public.perfiles (id) on delete set null,
  usuario text not null default '',
  rol text not null default '',
  accion text not null,
  detalle text not null default '',
  ref text not null default ''
);
create index on public.bitacora (empresa_id, momento desc);

-- Contador de números de informe por empresa
create table public.contadores (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nombre text not null,
  valor bigint not null default 0,
  primary key (empresa_id, nombre)
);

-- ---------------------------------------------------------------- funciones auxiliares (no expuestas)

create or replace function app.empresa_actual() returns uuid
language sql stable security definer set search_path = public as $$
  select empresa_id from public.perfiles where id = auth.uid() and activo
$$;

create or replace function app.rol_actual() returns text
language sql stable security definer set search_path = public as $$
  select rol from public.perfiles where id = auth.uid() and activo
$$;

create or replace function app.es_gestor() returns boolean
language sql stable as $$ select app.rol_actual() in ('superadmin', 'admin') $$;

create or replace function app.es_superadmin() returns boolean
language sql stable as $$ select app.rol_actual() = 'superadmin' $$;

grant usage on schema app to authenticated;
grant execute on all functions in schema app to authenticated;

-- ---------------------------------------------------------------- triggers

-- Completa empresa, autor y modificado_por; actualiza la fecha de modificación.
create or replace function app.sellar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.empresa_id := app.empresa_actual();
    if to_jsonb(new) ? 'autor' then new.autor := auth.uid(); end if;
  else
    new.empresa_id := old.empresa_id;            -- nunca cambia de empresa
  end if;
  if to_jsonb(new) ? 'modificado_por' then
    new.modificado_por := auth.uid();
    new.actualizado := now();
  end if;
  return new;
end $$;

create trigger t1_sellar before insert or update on public.clientes for each row execute function app.sellar();
create trigger t1_sellar before insert or update on public.visitas for each row execute function app.sellar();
create trigger t1_sellar before insert or update on public.informes for each row execute function app.sellar();

create or replace function app.sellar_simple() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.empresa_id := app.empresa_actual();
    if tg_table_name = 'fotos' then new.autor := auth.uid(); end if;
  else
    new.empresa_id := old.empresa_id;
  end if;
  return new;
end $$;

create trigger t1_sellar before insert or update on public.fotos for each row execute function app.sellar_simple();
create trigger t1_sellar before insert or update on public.notificaciones for each row execute function app.sellar_simple();

-- Número correlativo de informe por empresa: PREFIJO-0001 (prefijo desde configuracion.informes)
create or replace function app.numerar_informe() returns trigger
language plpgsql security definer set search_path = public as $$
declare n bigint; pref text;
begin
  insert into contadores (empresa_id, nombre, valor) values (new.empresa_id, 'informes', 1)
  on conflict (empresa_id, nombre) do update set valor = contadores.valor + 1
  returning valor into n;
  select coalesce(valor ->> 'prefijo', 'INF') into pref
    from configuracion where empresa_id = new.empresa_id and clave = 'informes';
  new.numero := coalesce(pref, 'INF') || '-' || lpad(n::text, 4, '0');
  return new;
end $$;

create trigger t2_numerar before insert on public.informes for each row execute function app.numerar_informe();

-- El técnico solo cambia estado/motivo de sus visitas y respeta las transiciones permitidas.
create or replace function app.validar_visita() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if app.rol_actual() = 'tecnico' then
    if tg_op = 'INSERT' then raise exception 'Solo un administrador agenda visitas'; end if;
    if old.responsable <> auth.uid() then raise exception 'La visita no es tuya'; end if;
    if (new.fecha, new.hora, new.cliente, new.cliente_id, new.direccion, new.telefono, new.tipo, new.responsable, new.notas)
       is distinct from
       (old.fecha, old.hora, old.cliente, old.cliente_id, old.direccion, old.telefono, old.tipo, old.responsable, old.notas) then
      raise exception 'El técnico solo puede cambiar el estado de la visita';
    end if;
    if new.estado <> old.estado and not (
         (old.estado = 'Programada' and new.estado in ('Aceptada', 'Cancelada')) or
         (old.estado = 'Aceptada' and new.estado in ('En curso', 'Cancelada')) or
         (old.estado = 'En curso' and new.estado in ('Realizada', 'Cancelada'))) then
      raise exception 'Cambio de estado no permitido';
    end if;
  end if;
  return new;
end $$;

create trigger t3_validar before insert or update on public.visitas for each row execute function app.validar_visita();

-- Bitácora automática: quién hizo cada acción, con fecha y hora
create or replace function app.registrar_bitacora() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.perfiles; fila jsonb; accion text;
begin
  select * into p from perfiles where id = auth.uid();
  if p.id is null then return coalesce(new, old); end if;
  fila := to_jsonb(coalesce(new, old));
  accion := lower(tg_table_name) || '_' || case tg_op when 'INSERT' then 'crear' when 'UPDATE' then 'editar' else 'eliminar' end;
  insert into bitacora (empresa_id, usuario_id, usuario, rol, accion, detalle, ref)
  values (p.empresa_id, p.id, p.usuario, p.rol, accion,
          coalesce(fila ->> 'cliente', fila ->> 'nombre', fila ->> 'numero', ''), fila ->> 'id');
  return coalesce(new, old);
end $$;

create trigger bitacora after insert or update or delete on public.clientes for each row execute function app.registrar_bitacora();
create trigger bitacora after insert or update or delete on public.visitas for each row execute function app.registrar_bitacora();
create trigger bitacora after insert or update or delete on public.informes for each row execute function app.registrar_bitacora();

-- ---------------------------------------------------------------- Row Level Security

alter table public.empresas enable row level security;
alter table public.perfiles enable row level security;
alter table public.configuracion enable row level security;
alter table public.clientes enable row level security;
alter table public.visitas enable row level security;
alter table public.informes enable row level security;
alter table public.fotos enable row level security;
alter table public.notificaciones enable row level security;
alter table public.bitacora enable row level security;
alter table public.drive_carpetas enable row level security;  -- sin políticas: solo el servidor
alter table public.contadores enable row level security;   -- sin políticas: solo los triggers escriben

-- empresas: ve la suya; solo el superadmin la edita
create policy empresas_ver on public.empresas for select using (id = app.empresa_actual());
create policy empresas_editar on public.empresas for update
  using (id = app.empresa_actual() and app.es_superadmin()) with check (id = app.empresa_actual());

-- perfiles: todos ven a los de su empresa; solo el superadmin crea/edita/borra (la creación de la cuenta de acceso va por función de servidor)
create policy perfiles_ver on public.perfiles for select using (empresa_id = app.empresa_actual());
create policy perfiles_editar on public.perfiles for update
  using (empresa_id = app.empresa_actual() and app.es_superadmin()) with check (empresa_id = app.empresa_actual());
create policy perfiles_borrar on public.perfiles for delete
  using (empresa_id = app.empresa_actual() and app.es_superadmin() and id <> auth.uid());

-- configuración: la ve toda la empresa; la escribe el superadmin
create policy config_ver on public.configuracion for select using (empresa_id = app.empresa_actual());
create policy config_escribir on public.configuracion for all
  using (empresa_id = app.empresa_actual() and app.es_superadmin())
  with check (empresa_id = app.empresa_actual());

-- clientes: ven todos de la empresa; gestionan admin y superadmin
create policy clientes_ver on public.clientes for select using (empresa_id = app.empresa_actual());
create policy clientes_gestionar on public.clientes for all
  using (empresa_id = app.empresa_actual() and app.es_gestor())
  with check (app.es_gestor());

-- visitas: gestores ven y gestionan todo; el técnico ve las suyas y solo cambia estado (lo valida el trigger)
create policy visitas_ver on public.visitas for select
  using (empresa_id = app.empresa_actual() and (app.es_gestor() or responsable = auth.uid()));
create policy visitas_crear on public.visitas for insert with check (app.es_gestor());
create policy visitas_editar on public.visitas for update
  using (empresa_id = app.empresa_actual() and (app.es_gestor() or responsable = auth.uid()));
create policy visitas_borrar on public.visitas for delete
  using (empresa_id = app.empresa_actual() and app.es_gestor());

-- informes: gestores ven todo; el técnico los suyos (autor o responsable)
create policy informes_ver on public.informes for select
  using (empresa_id = app.empresa_actual() and (app.es_gestor() or autor = auth.uid() or responsable = auth.uid()));
create policy informes_crear on public.informes for insert with check (app.empresa_actual() is not null);
create policy informes_editar on public.informes for update
  using (empresa_id = app.empresa_actual() and (app.es_gestor() or autor = auth.uid()));
create policy informes_borrar on public.informes for delete
  using (empresa_id = app.empresa_actual() and (app.es_gestor() or autor = auth.uid()));

-- fotos: según la visita a la que pertenecen (la política de visitas ya filtra por rol)
create policy fotos_ver on public.fotos for select
  using (empresa_id = app.empresa_actual() and exists (select 1 from public.visitas v where v.id = visita_id));
create policy fotos_crear on public.fotos for insert
  with check (exists (select 1 from public.visitas v where v.id = visita_id));
create policy fotos_borrar on public.fotos for delete
  using (empresa_id = app.empresa_actual() and (app.es_gestor() or autor = auth.uid()));

-- notificaciones: cada usuario las suyas
create policy notif_ver on public.notificaciones for select using (usuario_id = auth.uid());
create policy notif_marcar on public.notificaciones for update using (usuario_id = auth.uid());
create policy notif_borrar on public.notificaciones for delete using (usuario_id = auth.uid());

-- bitácora: solo el superadmin la lee; nadie la escribe a mano (solo triggers)
create policy bitacora_ver on public.bitacora for select
  using (empresa_id = app.empresa_actual() and app.es_superadmin());

-- ---------------------------------------------------------------- permisos de la API

revoke all on all tables in schema public from anon, authenticated;
grant select, insert, update, delete on public.clientes, public.visitas, public.informes,
  public.fotos, public.notificaciones, public.configuracion to authenticated;
grant select on public.empresas, public.bitacora to authenticated;
grant update on public.empresas to authenticated;
grant select, update, delete on public.perfiles to authenticated;

-- ---------------------------------------------------------------- alta de una empresa (SaaS)

-- Tras registrarse con Supabase Auth, la persona llama a rpc/registrar_empresa:
-- crea la empresa, su perfil de superadmin y la configuración inicial.
create or replace function public.registrar_empresa(p_empresa text, p_nombre text, p_usuario text)
returns uuid language plpgsql security definer set search_path = public as $$
declare e uuid;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
  if exists (select 1 from perfiles where id = auth.uid()) then raise exception 'Ya perteneces a una empresa'; end if;
  insert into empresas (nombre) values (trim(p_empresa)) returning id into e;
  insert into perfiles (id, empresa_id, usuario, nombre, rol, correo, cambiar_clave)
  values (auth.uid(), e, trim(p_usuario), trim(p_nombre), 'superadmin',
          (select email from auth.users where id = auth.uid()), false);
  insert into configuracion (empresa_id, clave, valor) values
    (e, 'empresa', jsonb_build_object('nombre', trim(p_empresa), 'subtitulo', '', 'ruc', '', 'direccion', '', 'telefono', '', 'correo', '', 'web', '', 'pie', '')),
    (e, 'tema', '{"primario": "#1565d8", "acento": "#f6c915"}'),
    (e, 'informes', '{"prefijo": "INF", "pdfChecklist": true, "pdfFotos": true, "pdfFirma": true, "pdfObservaciones": true}');
  return e;
end $$;

revoke all on function public.registrar_empresa(text, text, text) from public, anon;
grant execute on function public.registrar_empresa(text, text, text) to authenticated;

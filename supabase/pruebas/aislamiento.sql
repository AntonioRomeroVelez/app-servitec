-- Prueba de aislamiento y roles. Cada \echo imprime OK o el script se detiene con error.
\set ON_ERROR_STOP on
create or replace function pg_temp.como(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), false);
  execute 'set role authenticated';
end $$;
create or replace function pg_temp.afirmar(ok boolean, msg text) returns void language plpgsql as $$
begin if not ok then raise exception 'FALLO: %', msg; end if; raise notice 'OK: %', msg; end $$;
grant execute on function pg_temp.como(uuid), pg_temp.afirmar(boolean, text) to public;

insert into auth.users values
 ('a0000000-0000-0000-0000-000000000001', 'sa@a.com'), ('a0000000-0000-0000-0000-000000000002', 'sb@b.com'),
 ('a0000000-0000-0000-0000-000000000003', 'tec@a.com'), ('a0000000-0000-0000-0000-000000000004', 'tec2@a.com');

-- Las empresas las crea la plataforma; aquí se insertan directo (con service role) sus datos y superadmins
insert into empresas (nombre) values ('Empresa A'), ('Empresa B');
insert into perfiles (id, empresa_id, usuario, nombre, rol)
select 'a0000000-0000-0000-0000-000000000001', id, 'supera', 'Super A', 'superadmin' from empresas where nombre = 'Empresa A';
insert into perfiles (id, empresa_id, usuario, nombre, rol)
select 'a0000000-0000-0000-0000-000000000002', id, 'superb', 'Super B', 'superadmin' from empresas where nombre = 'Empresa B';
insert into configuracion (empresa_id, clave, valor)
select id, 'informes', '{"prefijo": "INF"}' from empresas;
insert into configuracion (empresa_id, clave, valor) select id, 'tema', '{}' from empresas;
insert into configuracion (empresa_id, clave, valor) select id, 'empresa', '{}' from empresas;

-- el superadmin A (con service role) crea dos técnicos en su empresa
insert into perfiles (id, empresa_id, usuario, nombre, rol)
select u.id, e.id, u.n, u.n, 'tecnico' from (values
  ('a0000000-0000-0000-0000-000000000003'::uuid, 'tec1'), ('a0000000-0000-0000-0000-000000000004'::uuid, 'tec2')) u(id, n),
  empresas e where e.nombre = 'Empresa A';

-- A agenda dos visitas, una por técnico
select pg_temp.como('a0000000-0000-0000-0000-000000000001');
insert into visitas (id, fecha, hora, cliente, tipo, responsable) values
 ('b0000000-0000-0000-0000-000000000001', '2026-11-20', '09:00', 'Cliente 1', 'Inspección', 'a0000000-0000-0000-0000-000000000003'),
 ('b0000000-0000-0000-0000-000000000002', '2026-11-20', '10:00', 'Cliente 2', 'Inspección', 'a0000000-0000-0000-0000-000000000004');
select pg_temp.afirmar((select count(*) from visitas) = 2, 'superadmin A ve sus 2 visitas');
select pg_temp.afirmar((select count(*) from bitacora) >= 2, 'la bitácora registra las altas');
reset role;

-- B no ve nada de A
select pg_temp.como('a0000000-0000-0000-0000-000000000002');
select pg_temp.afirmar((select count(*) from visitas) = 0, 'empresa B no ve visitas de A');
select pg_temp.afirmar((select count(*) from perfiles) = 1, 'empresa B solo ve su propio perfil');
select pg_temp.afirmar((select count(*) from empresas) = 1, 'empresa B solo ve su empresa');
update visitas set cliente = 'hack' where id = 'b0000000-0000-0000-0000-000000000001';
reset role;
select pg_temp.afirmar((select cliente from visitas where id = 'b0000000-0000-0000-0000-000000000001') = 'Cliente 1', 'B no puede editar visitas de A');

-- técnico 1: solo la suya, y solo puede cambiar el estado
select pg_temp.como('a0000000-0000-0000-0000-000000000003');
select pg_temp.afirmar((select count(*) from visitas) = 1, 'técnico ve solo su visita');
update visitas set estado = 'Aceptada' where id = 'b0000000-0000-0000-0000-000000000001';
select pg_temp.afirmar((select estado from visitas) = 'Aceptada', 'técnico acepta su visita');
do $$ begin
  begin update visitas set estado = 'Realizada' where id = 'b0000000-0000-0000-0000-000000000001';
    raise exception 'FALLO: permitió Aceptada -> Realizada'; exception when raise_exception then
    if sqlerrm like 'FALLO%' then raise; end if; raise notice 'OK: transición inválida rechazada (%)', sqlerrm; end;
  begin update visitas set cliente = 'otro' where id = 'b0000000-0000-0000-0000-000000000001';
    raise exception 'FALLO: técnico editó datos'; exception when raise_exception then
    if sqlerrm like 'FALLO%' then raise; end if; raise notice 'OK: técnico no edita datos (%)', sqlerrm; end;
  begin insert into visitas (fecha, hora, cliente, tipo, responsable) values ('2026-11-21', '09:00', 'x', 'y', 'a0000000-0000-0000-0000-000000000003');
    raise exception 'FALLO: técnico agendó'; exception when others then
    if sqlerrm like 'FALLO%' then raise; end if; raise notice 'OK: técnico no agenda (%)', sqlerrm; end;
end $$;
-- el técnico crea un informe: numerado y de su empresa
insert into informes (fecha, cliente, titulo, visita_id) values ('2026-11-20', 'Cliente 1', 'Informe', 'b0000000-0000-0000-0000-000000000001');
select pg_temp.afirmar((select numero from informes) = 'INF-0001', 'informe numerado INF-0001');
select pg_temp.afirmar((select count(*) from bitacora) = 0, 'técnico no lee la bitácora');
select pg_temp.afirmar((select count(*) from clientes) = 0, 'técnico sin clientes (vacío) sin error');
reset role;

-- técnico 2 no ve el informe del técnico 1
select pg_temp.como('a0000000-0000-0000-0000-000000000004');
select pg_temp.afirmar((select count(*) from informes) = 0, 'técnico 2 no ve informes ajenos');
select pg_temp.afirmar((select count(*) from visitas) = 1, 'técnico 2 ve solo su visita');
reset role;

-- fotos: mes por defecto, y la caché de carpetas de Drive no es accesible desde la app
select pg_temp.como('a0000000-0000-0000-0000-000000000003');
insert into fotos (visita_id, drive_id, nombre) values ('b0000000-0000-0000-0000-000000000001', 'drv1', 'f.jpg');
select pg_temp.afirmar((select mes from fotos) = to_char(now(), 'YYYY-MM'), 'la foto guarda su mes (AAAA-MM)');
do $$ begin
  begin perform count(*) from drive_carpetas; raise exception 'FALLO: la app leyó drive_carpetas';
  exception when insufficient_privilege then raise notice 'OK: drive_carpetas inaccesible desde la app'; end;
  begin insert into fotos (visita_id, drive_id, mes) values ('b0000000-0000-0000-0000-000000000001', 'x', '2026-13');
    raise exception 'FALLO: aceptó un mes inválido'; exception when check_violation then raise notice 'OK: mes inválido rechazado'; end;
end $$;
reset role;

-- B: su numeración es independiente
select pg_temp.como('a0000000-0000-0000-0000-000000000002');
insert into informes (fecha, cliente) values ('2026-11-20', 'X');
select pg_temp.afirmar((select numero from informes) = 'INF-0001', 'numeración independiente por empresa');
select pg_temp.afirmar((select count(*) from configuracion) = 3, 'configuración inicial de B creada');
reset role;

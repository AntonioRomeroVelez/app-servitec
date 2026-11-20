-- ServiTec SaaS: mensaje claro cuando la cédula no es válida (en vez de solo "no es válida" se dice qué está mal).

-- Devuelve el motivo por el que una cédula ecuatoriana no es válida, o null si lo es
create or replace function app.motivo_cedula(c text) returns text
language plpgsql immutable as $$
declare prov int;
begin
  if c is null or trim(c) = '' then return 'Escribe la cédula'; end if;
  if c !~ '^\d+$' then return 'La cédula solo lleva números'; end if;
  if length(c) <> 10 then return 'La cédula tiene 10 dígitos (tiene ' || length(c) || ')'; end if;
  prov := substr(c, 1, 2)::int;
  if not ((prov between 1 and 24) or prov = 30) then return 'Los dos primeros dígitos (provincia) no son válidos: van del 01 al 24 o 30'; end if;
  if substr(c, 3, 1)::int >= 6 then return 'El tercer dígito de la cédula debe ser menor a 6'; end if;
  if not app.cedula_valida(c) then return 'El último dígito de la cédula (verificador) no corresponde: revisa el número'; end if;
  return null;
end $$;

create or replace function app.validar_persona(p jsonb, emp uuid, excluir uuid default null) returns void
language plpgsql stable security definer set search_path = public as $$
declare tel text := trim(coalesce(p ->> 'telefono', '')); motivo text;
begin
  if array_length(regexp_split_to_array(trim(coalesce(p ->> 'nombre', '')), '\s+'), 1) < 2 then
    raise exception 'Escribe los nombres completos (nombres y apellidos)';
  end if;
  motivo := app.motivo_cedula(trim(coalesce(p ->> 'cedula', '')));
  if motivo is not null then raise exception '%', motivo; end if;
  if exists (select 1 from perfiles where empresa_id = emp and cedula = trim(p ->> 'cedula') and (excluir is null or id <> excluir)) then
    raise exception 'Ya existe un usuario con esa cédula';
  end if;
  if coalesce(p ->> 'correo', '') !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then raise exception 'El correo no es válido'; end if;
  if tel !~ '^[+\d][\d\s()-]*$' or length(regexp_replace(tel, '\D', '', 'g')) not between 7 and 15 then
    raise exception 'El teléfono no es válido (de 7 a 15 dígitos)';
  end if;
  if length(trim(coalesce(p ->> 'ciudad', ''))) = 0 then raise exception 'Escribe la ciudad'; end if;
end $$;

grant execute on all functions in schema app to authenticated;

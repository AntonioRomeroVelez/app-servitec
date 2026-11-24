-- El dueño de la empresa (superadmin) también puede ser responsable de una visita, como un técnico más:
-- se puede asignar a sí mismo y hace el proceso completo (aceptar, iniciar, finalizar, informe y fotos).
-- Los técnicos siguen limitados por sus reglas; el superadmin no las tiene porque ya gestiona todo.
create or replace function app.validar_visita_datos() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.responsable is distinct from old.responsable then
    if not exists (select 1 from perfiles where id = new.responsable and empresa_id = new.empresa_id and rol in ('tecnico', 'superadmin') and activo) then
      raise exception 'Técnico inválido';
    end if;
  end if;
  if new.estado = 'Cancelada' and length(trim(new.motivo)) = 0 then
    raise exception 'Indica el motivo de la cancelación';
  end if;
  return new;
end $$;

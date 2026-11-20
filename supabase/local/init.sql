-- Se ejecuta al crear la base: roles de Supabase, esquema auth y auth.uid().
-- Las claves de los roles se toman de POSTGRES_PASSWORD (mismo valor para todos en local).
\set clave `echo "$POSTGRES_PASSWORD"`
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator login noinherit password :'clave';
grant anon, authenticated, service_role to authenticator;
create role supabase_auth_admin login noinherit createrole password :'clave';
create schema auth authorization supabase_auth_admin;
alter role supabase_auth_admin set search_path = auth;
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant all on schema public to supabase_auth_admin;
-- auth.uid() como en Supabase: lee el claim "sub" del JWT que PostgREST deja en request.jwt.claims
create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true),
                         (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid
$$;
alter function auth.uid() owner to supabase_auth_admin;

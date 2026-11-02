update public.providers set parent_id = %s
where id = %s and parent_id is distinct from %s
  and exists (select 1 from public.providers where id = %s)

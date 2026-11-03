-- Row locks on films, in id order, held to the end of the transaction. No key update is enough
-- to queue behind another step or a fetch (both update the film) without blocking the
-- foreign keys of availability rows.
select id from public.titles where id = any(%s::bigint[]) order by id for no key update

-- The gap pass writes by id, and only where the path is still the one it downloaded.
update public.titles set poster_placeholder = %s
where id = %s and poster_path = %s and poster_placeholder is null

insert into public.certification_ages (country, certification, min_age) values (%s, %s, %s)
on conflict (country, certification) do update set min_age = excluded.min_age
where public.certification_ages.min_age is distinct from excluded.min_age

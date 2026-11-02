-- Countries whose certifications matter: enabled ones, and those we have ages for.
select code from public.countries where catalog_enabled
union
select country from public.certification_ages
order by 1

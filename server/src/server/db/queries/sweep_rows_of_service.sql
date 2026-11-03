-- How many offers one service has in one country, counted before a step touches them.
select count(*) from public.title_availability where country = %s and provider_id = %s

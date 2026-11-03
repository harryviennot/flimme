-- The films that have an offer of one service in one country that no sweep has seen since the
-- run began.
select distinct title_id from public.title_availability
where country = %s and provider_id = %s and checked_at < %s

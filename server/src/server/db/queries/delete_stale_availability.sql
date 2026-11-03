-- The offers a complete sweep did not see. The films come back so their tiers can be redone.
delete from public.title_availability
where country = %s and provider_id = %s and checked_at < %s
returning title_id

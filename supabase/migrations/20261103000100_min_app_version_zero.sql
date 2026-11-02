-- M3.10: the baseline seeded min_app_version at 1.0.0, which would block the 0.1.0
-- builds that exist today. Set it to 0.0.0 on both platforms; raising it later is a
-- one-row update by hand. Data only.
update public.app_config
set value = '{"ios": "0.0.0", "android": "0.0.0"}'::jsonb
where key = 'min_app_version';

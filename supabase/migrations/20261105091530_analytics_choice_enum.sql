-- M8.12: the analytics choice (analytics.md#analytics-consent). The enum alone, so the next file
-- can use it. on: the region's default mode. off: the opt-out. detailed: the EU, UK and Swiss
-- opt-in to identified analytics ("Help improve the app with detailed stats").

set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- squawk-ignore prefer-robust-stmts
create type public.analytics_choice as enum ('on', 'off', 'detailed');

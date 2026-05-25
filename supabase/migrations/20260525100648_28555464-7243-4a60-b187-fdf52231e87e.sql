ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS iop_time time;
UPDATE public.visits SET iop_time = COALESCE(iop_od_time, iop_os_time) WHERE iop_time IS NULL AND (iop_od_time IS NOT NULL OR iop_os_time IS NOT NULL);
ALTER TABLE public.visits DROP COLUMN IF EXISTS iop_od_time;
ALTER TABLE public.visits DROP COLUMN IF EXISTS iop_os_time;
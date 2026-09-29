alter table public.visits
  add column if not exists tonometer_type text;

alter table public.visits
  drop constraint if exists visits_tonometer_type_check;

alter table public.visits
  add constraint visits_tonometer_type_check
  check (
    tonometer_type is null
    or tonometer_type in (
      'Goldmann Applanation Tonometer (GAT)',
      'Non-contact / Air-puff Tonometer',
      'Tono-Pen',
      'iCare Rebound Tonometer',
      'Perkins Applanation Tonometer',
      'Schotz Tonometer',
      'Other'
    )
  );

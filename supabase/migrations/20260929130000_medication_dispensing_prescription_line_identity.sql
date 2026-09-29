-- Track medication dispensing by the exact prescription line.
-- A visit can contain the same medication name more than once with different
-- instructions. The prescription text is therefore the dispensing identity.

alter table public.visit_medication_dispensing
  drop constraint if exists visit_medication_dispensing_visit_id_medication_name_key;

alter table public.visit_medication_dispensing
  add constraint visit_medication_dispensing_visit_id_prescribed_text_key
  unique (visit_id, prescribed_text);

do $patch$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='mark_medication_item_dispensed'
    and pg_get_function_identity_arguments(p.oid)='p_visit_id uuid, p_medication_name text, p_inventory_id uuid';

  if v_def is null then
    raise exception 'mark_medication_item_dispensed not found';
  end if;

  v_def := replace(
    v_def,
    'v_medication_name text;',
    'v_medication_name text;
                  v_prescribed_text text;'
  );

  v_def := replace(
    v_def,
    'v_medication_name := trim(p_medication_name);',
    'v_prescribed_text := trim(p_medication_name);

                              IF v_prescribed_text = '''' THEN
                                  RAISE EXCEPTION ''Medication prescription is required'';
                              END IF;

                              IF position(''—'' in v_prescribed_text) > 0 THEN
                                  v_medication_name := trim(split_part(v_prescribed_text, ''—'', 1));
                              ELSE
                                  v_medication_name := v_prescribed_text;
                              END IF;'
  );

  v_def := replace(
    v_def,
    'v_medication_name,
                                                                                                                                                                                      v_medication_name,
                                                                                                                                                                                          p_inventory_id',
    'v_medication_name,
                                                                                                                                                                                      v_prescribed_text,
                                                                                                                                                                                          p_inventory_id'
  );

  v_def := replace(
    v_def,
    'ON CONFLICT (visit_id, medication_name)
                                                                                                                                                                                                DO NOTHING;',
    'ON CONFLICT (visit_id, prescribed_text)
                                                                                                                                                                                                DO NOTHING;'
  );

  v_def := replace(
    v_def,
    'AND lower(trim(medication_name)) = lower(v_medication_name)
                                                                                                                                                                                                                                          LIMIT 1;',
    'AND (
                                                                                                                                                                                                                                              prescribed_text = v_prescribed_text
                                                                                                                                                                                                                                              OR (
                                                                                                                                                                                                                                                  v_prescribed_text = v_medication_name
                                                                                                                                                                                                                                                  AND lower(trim(medication_name)) = lower(v_medication_name)
                                                                                                                                                                                                                                              )
                                                                                                                                                                                                                                          )
                                                                                                                                                                                                                                          ORDER BY CASE WHEN prescribed_text = v_prescribed_text THEN 0 ELSE 1 END, created_at ASC
                                                                                                                                                                                                                                          LIMIT 1;'
  );

  execute v_def;
end
$patch$;
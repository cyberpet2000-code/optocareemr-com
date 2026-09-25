-- Prevent concurrent dispense calls from charging inventory twice.
-- The dispensing SECURITY DEFINER RPCs perform their stock mutation before marking
-- the clinical record as dispensed. These BEFORE UPDATE guards make the final
-- "already dispensed" state atomic enough to roll back a concurrent duplicate.

create or replace function public.guard_visit_medication_dispensing_once()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if old.dispensed = true
     and new.dispensed = true
     and (
       new.dispensed_at is distinct from old.dispensed_at
       or new.dispensed_by is distinct from old.dispensed_by
     ) then
    raise exception '% has already been marked as dispensed', old.medication_name;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_guard_visit_medication_dispensing_once
  on public.visit_medication_dispensing;

create trigger trg_guard_visit_medication_dispensing_once
before update on public.visit_medication_dispensing
for each row
execute function public.guard_visit_medication_dispensing_once();


create or replace function public.guard_visit_dispensing_once()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if old.optical_dispensed = true
     and new.optical_dispensed = true
     and new.optical_dispensed_at is distinct from old.optical_dispensed_at then
    raise exception 'Optical item has already been marked as dispensed';
  end if;

  if old.medication_dispensed = true
     and new.medication_dispensed = true
     and new.medication_dispensed_at is distinct from old.medication_dispensed_at then
    raise exception 'Medication item has already been marked as dispensed';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_guard_visit_dispensing_once
  on public.visits;

create trigger trg_guard_visit_dispensing_once
before update on public.visits
for each row
execute function public.guard_visit_dispensing_once();

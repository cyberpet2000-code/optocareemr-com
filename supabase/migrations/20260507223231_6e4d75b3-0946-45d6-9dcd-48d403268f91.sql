DELETE FROM public.clinic_feature_flags a
USING public.clinic_feature_flags b
WHERE a.clinic_id = b.clinic_id
  AND a.ctid < b.ctid;

ALTER TABLE public.clinic_feature_flags
  ADD CONSTRAINT clinic_feature_flags_clinic_id_unique UNIQUE (clinic_id);
-- Keep the platform super-admin identity separate from the Cedar Eye
-- clinical identity. Dr. Obinna Kalu's Cedar clinical account is
-- obikalu2026@gmail.com; cyberpet2000@gmail.com remains platform super-admin.
-- Do not alter the super-admin role itself.

DELETE FROM public.clinic_users
WHERE user_id = '9640eb1e-f77d-4a1e-b853-d4526aa2677f'
  AND clinic_id = 'e3ab54d0-35a7-4abb-a554-9767bd69c292'
  AND lower(role::text) = 'doctor';

DELETE FROM public.user_roles
WHERE user_id = '9640eb1e-f77d-4a1e-b853-d4526aa2677f'
  AND clinic_id = 'e3ab54d0-35a7-4abb-a554-9767bd69c292'
  AND role::text = 'doctor';

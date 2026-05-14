
-- Fix infinite recursion in profiles & user_roles RLS that blocks login.
-- Make is_super_admin a SECURITY DEFINER (bypasses RLS), then replace recursive
-- policies that select from profiles inside profiles/user_roles policies.

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND is_super_admin = true
  );
$$;

-- profiles: drop recursive/duplicate policies, keep clean set
DROP POLICY IF EXISTS profiles_super_admin_all ON public.profiles;
DROP POLICY IF EXISTS profiles_super_admin_v2 ON public.profiles;
DROP POLICY IF EXISTS profiles_select_secure ON public.profiles;
DROP POLICY IF EXISTS profiles_select_bootstrap_safe ON public.profiles;
DROP POLICY IF EXISTS profiles_select_own_v2 ON public.profiles;
DROP POLICY IF EXISTS profiles_bootstrap_allow_self ON public.profiles;

CREATE POLICY profiles_select_self_or_super
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id OR public.is_super_admin(auth.uid()));

CREATE POLICY profiles_super_admin_manage
  ON public.profiles FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- user_roles: drop recursive/duplicate policies
DROP POLICY IF EXISTS user_roles_super_admin ON public.user_roles;
DROP POLICY IF EXISTS user_roles_super_admin_all ON public.user_roles;
DROP POLICY IF EXISTS "clinic user access" ON public.user_roles;
DROP POLICY IF EXISTS "user sees own roles" ON public.user_roles;
DROP POLICY IF EXISTS user_roles_select ON public.user_roles;
DROP POLICY IF EXISTS user_roles_select_own ON public.user_roles;

CREATE POLICY user_roles_select_self_or_super
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_super_admin(auth.uid()));

CREATE POLICY user_roles_super_admin_manage
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

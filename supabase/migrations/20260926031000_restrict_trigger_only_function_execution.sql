-- Trigger-only SECURITY DEFINER functions do not need client EXECUTE.
revoke all on function public.guard_billing_item_mutation() from public, anon, authenticated;
revoke all on function public.guard_billing_tenant_mutation() from public, anon, authenticated;
revoke all on function public.guard_hmo_claim_financial_mutation() from public, anon, authenticated;
revoke all on function public.guard_inventory_direct_mutation() from public, anon, authenticated;
revoke all on function public.guard_visit_medication_dispensing_once() from public, anon, authenticated;
revoke all on function public.guard_visit_dispensing_once() from public, anon, authenticated;
revoke all on function public.log_inventory_sale_movement() from public, anon, authenticated;

grant execute on function public.guard_billing_item_mutation() to service_role;
grant execute on function public.guard_billing_tenant_mutation() to service_role;
grant execute on function public.guard_hmo_claim_financial_mutation() to service_role;
grant execute on function public.guard_inventory_direct_mutation() to service_role;
grant execute on function public.guard_visit_medication_dispensing_once() to service_role;
grant execute on function public.guard_visit_dispensing_once() to service_role;
grant execute on function public.log_inventory_sale_movement() to service_role;

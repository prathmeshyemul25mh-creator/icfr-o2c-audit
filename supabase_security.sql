-- Run this AFTER the 9-table schema.
alter table public.customers enable row level security;
alter table public.sales_transactions enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.bank_transactions enable row level security;
alter table public.controls enable row level security;
alter table public.audit_samples enable row level security;
alter table public.control_tests enable row level security;
alter table public.exceptions enable row level security;

create policy "prototype customers" on public.customers for all to anon, authenticated using (true) with check (true);
create policy "prototype sales" on public.sales_transactions for all to anon, authenticated using (true) with check (true);
create policy "prototype invoices" on public.invoices for all to anon, authenticated using (true) with check (true);
create policy "prototype payments" on public.payments for all to anon, authenticated using (true) with check (true);
create policy "prototype bank" on public.bank_transactions for all to anon, authenticated using (true) with check (true);
create policy "prototype controls" on public.controls for all to anon, authenticated using (true) with check (true);
create policy "prototype samples" on public.audit_samples for all to anon, authenticated using (true) with check (true);
create policy "prototype tests" on public.control_tests for all to anon, authenticated using (true) with check (true);
create policy "prototype exceptions" on public.exceptions for all to anon, authenticated using (true) with check (true);

grant select,insert,update,delete on all tables in schema public to anon, authenticated;
grant usage,select on all sequences in schema public to anon, authenticated;

insert into storage.buckets(id,name,public) values('audit-evidence','audit-evidence',false) on conflict(id) do nothing;
create policy "prototype evidence upload" on storage.objects for insert to anon, authenticated with check(bucket_id='audit-evidence');
create policy "prototype evidence read" on storage.objects for select to anon, authenticated using(bucket_id='audit-evidence');
create policy "prototype evidence delete" on storage.objects for delete to anon, authenticated using(bucket_id='audit-evidence');

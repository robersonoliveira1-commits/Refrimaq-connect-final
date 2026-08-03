create table public.used_item_sales (
  id uuid default gen_random_uuid() primary key,
  used_item_id uuid references public.used_items(id) on delete restrict,
  customer_name text not null,
  customer_phone text,
  payment_method text not null,
  status text default 'Paga',
  total numeric not null,
  notes text,
  seller_name text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.used_item_sales enable row level security;

create policy "Administrators have full access to used_item_sales"
  on public.used_item_sales
  for all
  to authenticated
  using (
    exists (
      select 1 from user_profiles
      where user_profiles.id = auth.uid()
      and user_profiles.role = 'admin'
    )
  );

create policy "Anyone can insert used_item_sales"
  on public.used_item_sales
  for insert
  to authenticated
  with check (true);

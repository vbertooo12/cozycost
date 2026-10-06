-- =====================================================================
-- Cozy Crafts — database schema for Supabase
-- Run this whole file once in Supabase → SQL Editor → New query → Run.
-- Then run seed.sql. Run it on a NEW project (it creates the tables).
-- =====================================================================

-- ---------- Starting over? (DELETES ALL SHOP DATA) ----------
-- Only if you need to rebuild from scratch: remove the "--" in front of
-- the 7 lines below, run the file, then put the "--" back.
-- drop table if exists public.inventory_movements cascade;
-- drop table if exists public.order_items cascade;
-- drop table if exists public.orders cascade;
-- drop table if exists public.messages cascade;
-- drop table if exists public.products cascade;
-- drop table if exists public.categories cascade;
-- drop table if exists public.admins cascade;

-- =====================================================================
-- TABLES
-- =====================================================================

create table public.categories (
  id     text primary key,                 -- url-friendly id, e.g. 'stickers'
  name   text not null,
  blurb  text not null default '',
  icon   text not null default 'stickers', -- which built-in illustration to show
  tint   text not null default 'bg-blue',  -- bg-blue | bg-peach | bg-sage | bg-beige
  sort   int  not null default 0
);

create table public.products (
  id                  uuid primary key default gen_random_uuid(),
  slug                text unique not null,
  name                text not null check (length(name) between 1 and 120),
  category_id         text references public.categories(id) on update cascade on delete set null,
  description         text not null default '',
  price               numeric(10,2) check (price is null or price >= 0),   -- null = "Price coming soon"
  stock               int  not null default 0 check (stock >= 0),
  low_stock_threshold int  not null default 5 check (low_stock_threshold >= 0),
  status              text not null default 'coming-soon'
                      check (status in ('available','new','coming-soon','sold-out')),
  image_url           text,
  art                 text not null default 'stickers',  -- fallback illustration when no photo
  tint                text not null default 'bg-beige',
  is_concept          boolean not null default false,    -- concept/placeholder, never orderable
  featured            boolean not null default false,
  allow_customization boolean not null default false,    -- shows a "personalization" note at order time
  is_archived         boolean not null default false,    -- hidden from the shop, kept for old orders
  sort                int not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index products_category_idx on public.products(category_id);

create table public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.orders (
  id             uuid primary key default gen_random_uuid(),
  order_number   text unique not null,
  customer_name  text not null,
  email          text not null,
  phone          text not null,
  fulfillment    text not null check (fulfillment in ('pickup','delivery')),
  address        text,
  payment_method text not null check (payment_method in ('gcash','bank_transfer','cash')),
  notes          text,
  subtotal       numeric(10,2) not null default 0,
  status         text not null default 'pending'
                 check (status in ('pending','confirmed','in_production','ready','completed','cancelled')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid','refunded')),
  admin_notes    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index orders_status_idx on public.orders(status);
create index orders_created_idx on public.orders(created_at desc);

create table public.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  product_id    uuid references public.products(id) on delete set null,
  product_name  text not null,            -- snapshot, so old orders survive product edits
  unit_price    numeric(10,2) not null,
  quantity      int not null check (quantity between 1 and 100),
  customization text,
  line_total    numeric(10,2) not null
);
create index order_items_order_idx on public.order_items(order_id);

create table public.inventory_movements (
  id          bigint generated always as identity primary key,
  product_id  uuid references public.products(id) on delete cascade,
  change      int not null,
  stock_after int not null,
  reason      text not null check (reason in ('initial','order','order_cancelled','order_restored','restock','adjustment')),
  order_id    uuid references public.orders(id) on delete set null,
  note        text,
  created_by  uuid,
  created_at  timestamptz not null default now()
);
create index inventory_movements_product_idx on public.inventory_movements(product_id, created_at desc);

create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(name) between 1 and 120),
  email      text not null check (length(email) between 3 and 200),
  topic      text not null default 'General Question'
             check (topic in ('Product Inquiry','Custom Request','Collaboration','General Question')),
  message    text not null check (length(message) between 1 and 4000),
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- HELPERS + TRIGGERS
-- =====================================================================

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

-- Keep product status in step with stock:
--  * an orderable product that runs out becomes "sold-out"
--  * a sold-out product that gets restocked becomes "available" again
create or replace function public.sync_stock_status()
returns trigger language plpgsql as $$
begin
  if new.stock <= 0 and new.status in ('available','new') then
    new.status := 'sold-out';
  elsif new.stock > 0 and new.status = 'sold-out'
        and (tg_op = 'INSERT' or old.stock <= 0) then
    new.status := 'available';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger products_sync_status before insert or update on public.products
  for each row execute function public.sync_stock_status();

-- Every stock change is written to inventory_movements automatically.
-- Functions below set cc.reason / cc.order_id / cc.note to label the change.
create or replace function public.log_stock_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_reason text := coalesce(nullif(current_setting('cc.reason', true), ''), 'adjustment');
  v_order  uuid := nullif(current_setting('cc.order_id', true), '')::uuid;
  v_note   text := nullif(current_setting('cc.note', true), '');
begin
  if tg_op = 'INSERT' then
    if new.stock > 0 then
      insert into public.inventory_movements(product_id, change, stock_after, reason, note, created_by)
      values (new.id, new.stock, new.stock, 'initial', 'Starting stock', auth.uid());
    end if;
  elsif new.stock is distinct from old.stock then
    insert into public.inventory_movements(product_id, change, stock_after, reason, order_id, note, created_by)
    values (new.id, new.stock - old.stock, new.stock, v_reason, v_order, v_note, auth.uid());
  end if;
  return null;
end $$;

create trigger products_log_stock after insert or update of stock on public.products
  for each row execute function public.log_stock_change();

-- =====================================================================
-- FUNCTIONS CALLED FROM THE WEBSITE
-- =====================================================================

-- Guest checkout. Prices and stock are read from the database (never trusted
-- from the browser), stock is reserved immediately and logged as 'order'.
create or replace function public.place_order(p_customer jsonb, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order_id    uuid;
  v_number      text;
  v_total       numeric(10,2) := 0;
  v_item        jsonb;
  v_prod        public.products%rowtype;
  v_qty         int;
  v_custom      text;
  v_name        text := trim(coalesce(p_customer->>'name', ''));
  v_email       text := lower(trim(coalesce(p_customer->>'email', '')));
  v_phone       text := trim(coalesce(p_customer->>'phone', ''));
  v_fulfillment text := coalesce(p_customer->>'fulfillment', 'pickup');
  v_address     text := nullif(left(trim(coalesce(p_customer->>'address', '')), 500), '');
  v_payment     text := coalesce(p_customer->>'payment_method', 'gcash');
  v_notes       text := nullif(left(trim(coalesce(p_customer->>'notes', '')), 1000), '');
begin
  if length(v_name) < 2 or length(v_name) > 120 then raise exception 'Please enter your name.'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(v_email) > 200 then
    raise exception 'Please enter a valid email address.'; end if;
  if length(regexp_replace(v_phone, '[^0-9]', '', 'g')) < 7 or length(v_phone) > 30 then
    raise exception 'Please enter a valid phone number.'; end if;
  if v_fulfillment not in ('pickup','delivery') then raise exception 'Please choose pickup or delivery.'; end if;
  if v_fulfillment = 'delivery' and v_address is null then raise exception 'Please enter a delivery address.'; end if;
  if v_payment not in ('gcash','bank_transfer','cash') then raise exception 'Please choose a payment method.'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty.'; end if;
  if jsonb_array_length(p_items) > 30 then raise exception 'Too many different items in one order.'; end if;

  -- readable, unique order number, e.g. CC-261006-7F3A2
  loop
    v_number := 'CC-' || to_char(now() at time zone 'Asia/Manila', 'YYMMDD') || '-'
                || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));
    exit when not exists (select 1 from public.orders where order_number = v_number);
  end loop;

  insert into public.orders(order_number, customer_name, email, phone, fulfillment, address, payment_method, notes)
  values (v_number, v_name, v_email, v_phone, v_fulfillment,
          case when v_fulfillment = 'delivery' then v_address end, v_payment, v_notes)
  returning id into v_order_id;

  perform set_config('cc.reason', 'order', true);
  perform set_config('cc.order_id', v_order_id::text, true);
  perform set_config('cc.note', v_number, true);

  for v_item in select value from jsonb_array_elements(p_items) loop
    begin
      v_qty := (v_item->>'quantity')::int;
    exception when others then v_qty := null;
    end;
    if v_qty is null or v_qty < 1 or v_qty > 100 then raise exception 'Please check the quantities in your cart.'; end if;

    begin
      select * into v_prod from public.products
       where id = (v_item->>'product_id')::uuid and not is_archived
       for update;
    exception when invalid_text_representation then
      raise exception 'A product in your cart is no longer available.';
    end;
    if not found then raise exception 'A product in your cart is no longer available.'; end if;
    if v_prod.is_concept or v_prod.price is null or v_prod.status not in ('available','new') then
      raise exception '% is not available to order right now.', v_prod.name;
    end if;
    if v_prod.stock < v_qty then
      raise exception 'Sorry, only % of "%" left in stock.', v_prod.stock, v_prod.name;
    end if;

    v_custom := case when v_prod.allow_customization
                     then nullif(left(trim(coalesce(v_item->>'customization', '')), 500), '') end;

    insert into public.order_items(order_id, product_id, product_name, unit_price, quantity, customization, line_total)
    values (v_order_id, v_prod.id, v_prod.name, v_prod.price, v_qty, v_custom, v_prod.price * v_qty);

    update public.products set stock = stock - v_qty where id = v_prod.id;
    v_total := v_total + v_prod.price * v_qty;
  end loop;

  update public.orders set subtotal = v_total where id = v_order_id;
  return jsonb_build_object('order_number', v_number, 'subtotal', v_total);
end $$;

-- Order tracking for guests: needs the order number AND the email used.
create or replace function public.track_order(p_order_number text, p_email text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_order public.orders%rowtype;
begin
  select * into v_order from public.orders
   where order_number = upper(trim(p_order_number)) and email = lower(trim(p_email));
  if not found then return null; end if;
  return jsonb_build_object(
    'order_number',   v_order.order_number,
    'status',         v_order.status,
    'payment_status', v_order.payment_status,
    'payment_method', v_order.payment_method,
    'fulfillment',    v_order.fulfillment,
    'subtotal',       v_order.subtotal,
    'created_at',     v_order.created_at,
    'updated_at',     v_order.updated_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('name', product_name, 'quantity', quantity,
                       'unit_price', unit_price, 'line_total', line_total, 'customization', customization))
        from public.order_items where order_id = v_order.id), '[]'::jsonb)
  );
end $$;

-- Admin: update an order. Cancelling returns its items to stock;
-- un-cancelling takes them out again (if there is enough stock).
create or replace function public.admin_update_order(
  p_order_id uuid, p_status text default null, p_payment_status text default null, p_admin_notes text default null)
returns public.orders language plpgsql security definer set search_path = public as $$
declare
  v_old  public.orders%rowtype;
  v_new  public.orders%rowtype;
  v_item record;
  v_stock int;
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  select * into v_old from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found.'; end if;

  if p_status is not null and p_status <> v_old.status then
    if p_status = 'cancelled' then
      perform set_config('cc.reason', 'order_cancelled', true);
      perform set_config('cc.order_id', v_old.id::text, true);
      perform set_config('cc.note', v_old.order_number, true);
      for v_item in select product_id, sum(quantity) q from public.order_items
                     where order_id = v_old.id and product_id is not null group by product_id loop
        update public.products set stock = stock + v_item.q where id = v_item.product_id;
      end loop;
    elsif v_old.status = 'cancelled' then
      perform set_config('cc.reason', 'order_restored', true);
      perform set_config('cc.order_id', v_old.id::text, true);
      perform set_config('cc.note', v_old.order_number, true);
      for v_item in select oi.product_id, sum(oi.quantity) q, max(oi.product_name) n from public.order_items oi
                     where oi.order_id = v_old.id and oi.product_id is not null group by oi.product_id loop
        select stock into v_stock from public.products where id = v_item.product_id for update;
        if v_stock < v_item.q then
          raise exception 'Not enough stock of "%" to restore this order (% left).', v_item.n, v_stock;
        end if;
        update public.products set stock = stock - v_item.q where id = v_item.product_id;
      end loop;
    end if;
  end if;

  update public.orders set
    status         = coalesce(p_status, status),
    payment_status = coalesce(p_payment_status, payment_status),
    admin_notes    = coalesce(p_admin_notes, admin_notes)
  where id = p_order_id
  returning * into v_new;
  return v_new;
end $$;

-- Admin: restock or correct stock, with a reason that shows in the inventory log.
create or replace function public.admin_adjust_stock(
  p_product_id uuid, p_change int, p_reason text default 'restock', p_note text default null)
returns public.products language plpgsql security definer set search_path = public as $$
declare v_prod public.products%rowtype;
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  if p_reason not in ('restock','adjustment') then raise exception 'Reason must be restock or adjustment.'; end if;
  if p_change = 0 then raise exception 'Enter a quantity to add or remove.'; end if;
  select * into v_prod from public.products where id = p_product_id for update;
  if not found then raise exception 'Product not found.'; end if;
  if v_prod.stock + p_change < 0 then
    raise exception 'Stock cannot go below zero (currently %).', v_prod.stock; end if;
  perform set_config('cc.reason', p_reason, true);
  perform set_config('cc.order_id', '', true);
  perform set_config('cc.note', left(coalesce(p_note, ''), 300), true);
  update public.products set stock = stock + p_change where id = p_product_id returning * into v_prod;
  return v_prod;
end $$;

-- =====================================================================
-- ROW LEVEL SECURITY
-- Visitors can only: read categories/products, send a contact message,
-- and call place_order / track_order. Everything else is admin-only.
-- =====================================================================

alter table public.categories          enable row level security;
alter table public.products            enable row level security;
alter table public.admins              enable row level security;
alter table public.orders              enable row level security;
alter table public.order_items         enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.messages            enable row level security;

create policy "categories readable"  on public.categories for select using (true);
create policy "categories admin"     on public.categories for all using (public.is_admin()) with check (public.is_admin());

create policy "products readable"    on public.products for select using (not is_archived or public.is_admin());
create policy "products admin"       on public.products for all using (public.is_admin()) with check (public.is_admin());

create policy "admins see self"      on public.admins for select using (user_id = auth.uid());

create policy "orders admin"         on public.orders for all using (public.is_admin()) with check (public.is_admin());
create policy "order items admin"    on public.order_items for all using (public.is_admin()) with check (public.is_admin());
create policy "inventory admin read" on public.inventory_movements for select using (public.is_admin());

create policy "anyone can send a message" on public.messages for insert to anon, authenticated with check (is_read = false);
create policy "messages admin"       on public.messages for select using (public.is_admin());
create policy "messages admin edit"  on public.messages for update using (public.is_admin()) with check (public.is_admin());
create policy "messages admin del"   on public.messages for delete using (public.is_admin());

-- Only the functions above may be called by visitors.
revoke all on function public.place_order(jsonb, jsonb) from public;
revoke all on function public.track_order(text, text) from public;
revoke all on function public.admin_update_order(uuid, text, text, text) from public;
revoke all on function public.admin_adjust_stock(uuid, int, text, text) from public;
grant execute on function public.place_order(jsonb, jsonb)                to anon, authenticated;
grant execute on function public.track_order(text, text)                  to anon, authenticated;
grant execute on function public.admin_update_order(uuid, text, text, text) to authenticated;
grant execute on function public.admin_adjust_stock(uuid, int, text, text)  to authenticated;
grant execute on function public.is_admin()                               to anon, authenticated;

-- =====================================================================
-- STORAGE: product photos (public to view, admin-only to upload)
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

drop policy if exists "product images admin insert" on storage.objects;
drop policy if exists "product images admin update" on storage.objects;
drop policy if exists "product images admin delete" on storage.objects;
create policy "product images admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_admin());
create policy "product images admin update" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.is_admin());
create policy "product images admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.is_admin());

-- =====================================================================
-- REALTIME: lets the admin dashboard pop up new orders as they arrive
-- (only admins receive them, because realtime follows the RLS above)
-- =====================================================================
do $$ begin
  alter publication supabase_realtime add table public.orders;
exception when duplicate_object then null;
end $$;

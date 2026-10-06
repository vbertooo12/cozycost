-- =====================================================================
-- Cozy Crafts — starter content
-- Run after schema.sql. These are the six concept pieces from the site:
-- clearly marked as concepts, no prices, not orderable.
-- Replace them in the admin dashboard as real products are ready.
-- =====================================================================

insert into public.categories (id, name, blurb, icon, tint, sort) values
  ('stickers',     'Stickers',             'Cute and creative sticker designs.',                 'stickers', 'bg-blue',  1),
  ('digital-art',  'Digital Artwork',      'Original digital illustrations and prints.',         'print',    'bg-peach', 2),
  ('stationery',   'Stationery',           'Creative paper goods and printable designs.',        'notebook', 'bg-sage',  3),
  ('personalized', 'Personalized Crafts',  'Custom pieces made around a name or memory.',        'tag',      'bg-beige', 4),
  ('gifts',        'Gift Ideas',           'Small creative items made for giving.',              'gift',     'bg-peach', 5),
  ('seasonal',     'Seasonal Collections', 'Little collections for holidays and special days.',  'bookmark', 'bg-blue',  6)
on conflict (id) do update set name = excluded.name, blurb = excluded.blurb, icon = excluded.icon,
  tint = excluded.tint, sort = excluded.sort;

insert into public.products
  (slug, name, category_id, description, price, stock, status, art, tint, is_concept, featured, allow_customization, sort)
values
  ('cozy-sticker-collection', 'Cozy Sticker Collection', 'stickers',
   'A first set of sticker designs is being sketched. New sticker designs coming soon.',
   null, 0, 'coming-soon', 'stickers', 'bg-blue', true, true, false, 1),
  ('mini-art-prints', 'Mini Art Prints', 'digital-art',
   'Small illustrated prints for desks and shelves. Our first collection is currently in progress.',
   null, 0, 'coming-soon', 'print', 'bg-peach', true, true, false, 2),
  ('cute-stationery', 'Cute Stationery', 'stationery',
   'Notepads, cards and printable paper goods. More designs coming soon.',
   null, 0, 'coming-soon', 'notebook', 'bg-sage', true, true, false, 3),
  ('personalized-name-tags', 'Personalized Name Tags', 'personalized',
   'Custom pieces made around a name, date or little detail. Product details coming soon.',
   null, 0, 'coming-soon', 'tag', 'bg-beige', true, true, true, 4),
  ('little-gift-bundles', 'Little Gift Bundles', 'gifts',
   'Small creative pieces put together for giving. More details coming soon.',
   null, 0, 'coming-soon', 'gift', 'bg-peach', true, true, false, 5),
  ('illustrated-bookmarks', 'Illustrated Bookmarks', 'stationery',
   'Bookmarks with little illustrations for your reading pile. Product details coming soon.',
   null, 0, 'coming-soon', 'bookmark', 'bg-blue', true, true, false, 6)
on conflict (slug) do nothing;

# Cozy Crafts Shop

The Cozy Crafts website with online ordering and an admin dashboard.
Plain HTML, CSS and JavaScript (no build step) · **Supabase** for the database, login and photos · **Vercel** for hosting.

## What it does

**For customers** (the website)
- Browse products by category, open a quick view and add items to a cart, including personalization notes for custom items.
- Check out as a guest with name, mobile number, email, pickup or delivery, and a payment preference (GCash, bank transfer or cash). **No payment is taken online.** You confirm each order and arrange payment yourself.
- Get an order number (e.g. `CC-261006-7F3A2`) and track the order's status with that number and their email.
- Send messages through the contact form. They land in the admin inbox.

**For you** (the admin at `/admin`)
- **Overview:** orders waiting to be confirmed, payments outstanding, low stock and unread messages.
- **Orders:** filter, search, open an order, change its status (Pending → Confirmed → In production → Ready → Completed, or Cancelled), mark it paid, keep private notes, copy the customer's details and export to CSV. New orders pop up live while the dashboard is open.
- **Products:** add and edit products, prices, photos (uploaded to Supabase Storage), categories, featured items and personalization. You can hide a product or delete it.
- **Inventory:** stock levels, how many units are in open orders, low stock warnings, restocks and corrections, a full stock history and CSV export.
- **Messages:** contact form inbox.

**How orders and inventory work together**
1. When a customer places an order, the database checks the real price and stock and **takes the stock out right away**. Two people can't buy the last item.
2. Every stock change is logged automatically: order, cancellation, restock, correction.
3. A product that reaches 0 becomes **Sold Out** by itself. When you restock it, it goes back to **Available**.
4. **Cancelling** an order puts its items back in stock. Un-cancelling takes them out again if there's enough.

Prices, stock and order totals are always calculated in the database, never trusted from the browser. Visitors can't read other people's orders.

## Files

```
index.html            the shop (home, shop, checkout, order confirmation, tracking, design system)
css/tokens.css        colors, fonts, light/dark mode (shared with admin)
css/styles.css        shop styles
js/config.js          ← your Supabase URL + anon key go here
js/supabase.js        connects to Supabase
js/shared.js          illustrations and helpers shared with admin
js/store.js           shop logic: products, cart, checkout, tracking, contact form
admin/                the admin dashboard (index.html, admin.css, admin.js)
assets/logo.webp      your logo
supabase/schema.sql   database tables, security rules, order + stock functions
supabase/seed.sql     categories + the six concept pieces
vercel.json           hosting settings (security headers, admin not indexed)
```

## Setup (about 15 minutes)

### 1. Create the Supabase project
1. Sign in at [supabase.com](https://supabase.com) → **New project**. Choose a region close to your customers (e.g. Singapore).
2. Go to **SQL Editor → New query**, paste all of `supabase/schema.sql` and click **Run**.
3. Open a new query, paste `supabase/seed.sql` and click **Run**.

### 2. Create your admin login
1. **Authentication → Users → Add user → Create new user.** Enter your email and a strong password, and tick **Auto Confirm User**.
2. In **SQL Editor**, run this with your email:
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'you@example.com';
   ```
3. **Turn off public sign-ups:** go to **Authentication → Sign In / Providers** and switch off **Allow new users to sign up**. Only accounts you add can log in, and only accounts in the `admins` table can see anything.

### 3. Connect the website
1. In Supabase go to **Project Settings → API** (or **API Keys**) and copy the **Project URL** and the **anon public** key (newer projects call it the **publishable** key).
2. Paste both into `js/config.js`.

The anon/publishable key is meant to be public. **Never** put the `service_role` / secret key in any file of this site.

### 4. Preview on your computer
The site uses JavaScript modules, so open it through a small local server rather than by double-clicking:
```bash
npx serve .
```
Then visit the address it prints (usually http://localhost:3000). The admin is at `/admin/`.

### 5. Deploy to Vercel
**Option A, with GitHub (recommended, so every change redeploys automatically):**
1. Put this folder in a GitHub repository.
2. At [vercel.com](https://vercel.com) go to **Add New → Project** and import the repo.
3. Set **Framework Preset** to **Other**, leave **Build Command** empty and set **Output Directory** to `.`. Then click **Deploy**.

**Option B, from your computer:**
```bash
npm i -g vercel
vercel        # first time: follow the prompts
vercel --prod
```

Then, in Supabase **Authentication → URL Configuration**, set **Site URL** to your Vercel address (e.g. `https://cozy-crafts.vercel.app`).

## Day-to-day

- **Opening a product for orders:** Admin → Products → Add product. Give it a price, set the status to Available or New and enter the starting stock. Untick **Concept piece**.
- **Retiring the concept pieces:** edit each one and tick **Hidden from the shop**, or turn it into a real product.
- **A new batch arrives:** Inventory → Adjust → New batch / restock → enter the quantity.
- **Confirming an order:** open it, contact the customer with payment details and set the status to **Confirmed**. When they pay, set Payment to **Paid**.
- **Social links:** edit the `SOCIALS` list at the top of `js/store.js`.
- **Wording:** the "what happens next" steps after checkout are in `index.html` (search for `next-steps`). Change them to match how you work.

## Good next steps (not included yet)

- **Email notifications** for new orders and status changes. Add a Supabase Database Webhook or Edge Function that sends mail through a service such as Resend.
- **Online payment** (e.g. PayMongo for GCash and cards). This needs a merchant account and a small server function.
- **Spam protection** for checkout and the contact form (e.g. Cloudflare Turnstile) if you start getting junk orders.
- **Backups:** Supabase's free plan has limited backups. Export orders as CSV from the admin regularly, or upgrade when the shop grows.

/* =====================================================================
   Cozy Crafts — admin dashboard
   Sign-in uses Supabase Auth. Every read/write here is protected by the
   Row Level Security rules in supabase/schema.sql, so only accounts listed
   in the `admins` table can see or change anything.
   ===================================================================== */
import { supabase, isConfigured, friendlyError } from "../js/supabase.js";
import { SHOP } from "../js/config.js";
import { ART, ART_KEYS, STATUS_LABEL, esc } from "../js/shared.js";

const $ = id => document.getElementById(id);
const money = new Intl.NumberFormat(SHOP.locale, { style: "currency", currency: SHOP.currency });
const fmt = n => money.format(Number(n) || 0);
const dt = d => new Date(d).toLocaleString(SHOP.locale, { dateStyle: "medium", timeStyle: "short" });
const dshort = d => new Date(d).toLocaleDateString(SHOP.locale, { month: "short", day: "numeric" });

const ORDER_STATUS = { pending: "Pending", confirmed: "Confirmed", in_production: "In production", ready: "Ready", completed: "Completed", cancelled: "Cancelled" };
const PAY_STATUS = { unpaid: "Unpaid", paid: "Paid", refunded: "Refunded" };
const PAY_METHOD = { gcash: "GCash", bank_transfer: "Bank transfer", cash: "Cash" };
const REASON = { initial: "Starting stock", order: "Order", order_cancelled: "Order cancelled", order_restored: "Order restored", restock: "Restock", adjustment: "Correction" };
const OPEN = ["pending", "confirmed", "in_production", "ready"];

let data = { orders: [], products: [], categories: [], moves: [], messages: [] };
let orderFilter = "open", productFilter = "all";

/* ---------- toast ---------- */
const toastEl = $("toast"); let toastT;
function toast(msg) { toastEl.textContent = msg; toastEl.classList.remove("hide"); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.add("hide"), 3600); }
async function copyText(text, okMsg) {
  try { await navigator.clipboard.writeText(text); toast(okMsg); }
  catch { toast("Couldn't copy automatically. Please select and copy it yourself."); }
}
function showError(el, err) { el.textContent = friendlyError(err); el.hidden = false; }
function downloadCSV(name, rows) {
  const csv = rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const media = p => p.image_url ? `<img src="${esc(p.image_url)}" alt="">` : (ART[p.art] || ART.stickers);

/* =====================================================================
   AUTH
   ===================================================================== */
function showOnly(id) { ["setupView", "loginView", "deniedView", "appView"].forEach(v => ($(v).hidden = v !== id)); }

async function boot() {
  if (!isConfigured) { showOnly("setupView"); return; }
  const { data: { session } } = await supabase.auth.getSession();
  await onSession(session);
  supabase.auth.onAuthStateChange((event, s) => { if (event === "SIGNED_OUT") onSession(null); });
}

async function onSession(session) {
  if (!session) { showOnly("loginView"); $("l-email").focus(); return; }
  const { data: rows, error } = await supabase.from("admins").select("user_id").eq("user_id", session.user.id);
  if (error || !rows.length) { $("deniedEmail").textContent = session.user.email; showOnly("deniedView"); return; }
  $("whoami").textContent = session.user.email;
  showOnly("appView");
  await loadAll();
  route();
  listenForOrders();
}

$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const err = $("loginError"); err.hidden = true;
  const btn = $("loginBtn"); btn.disabled = true; btn.textContent = "Signing in…";
  const { data: res, error } = await supabase.auth.signInWithPassword({ email: $("l-email").value.trim(), password: $("l-pass").value });
  btn.disabled = false; btn.textContent = "Sign in";
  if (error) { err.textContent = /invalid/i.test(error.message) ? "That email and password don't match an account." : friendlyError(error); err.hidden = false; return; }
  $("l-pass").value = "";
  onSession(res.session);
});
document.addEventListener("click", async e => {
  if (e.target.closest("[data-signout]")) { await supabase.auth.signOut(); showOnly("loginView"); }
});

/* =====================================================================
   DATA
   ===================================================================== */
async function loadAll() {
  const [orders, products, categories, moves, messages] = await Promise.all([
    supabase.from("orders").select("*, order_items(*)").order("created_at", { ascending: false }).limit(1000),
    supabase.from("products").select("*").order("sort").order("created_at"),
    supabase.from("categories").select("*").order("sort"),
    supabase.from("inventory_movements").select("*, products(name), orders(order_number)").order("created_at", { ascending: false }).limit(100),
    supabase.from("messages").select("*").order("created_at", { ascending: false }).limit(500)
  ]);
  const firstErr = [orders, products, categories, moves, messages].find(r => r.error);
  if (firstErr) toast("Couldn't load everything: " + friendlyError(firstErr.error));
  data = {
    orders: orders.data || [], products: products.data || [], categories: categories.data || [],
    moves: moves.data || [], messages: messages.data || []
  };
  renderAll();
}
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-refresh]"); if (!b) return;
  b.disabled = true; await loadAll(); b.disabled = false; toast("Up to date.");
});

function listenForOrders() {
  supabase.channel("admin-orders")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, payload => {
      toast(`New order ${payload.new.order_number} from ${payload.new.customer_name}`);
      loadAll();
    })
    .subscribe();
}

/* ---------- derived ---------- */
const isLow = p => !p.is_archived && !p.is_concept && p.status !== "coming-soon" && p.stock <= p.low_stock_threshold;
const openQty = id => data.orders.filter(o => OPEN.includes(o.status))
  .flatMap(o => o.order_items).filter(i => i.product_id === id).reduce((s, i) => s + i.quantity, 0);
const catName = id => (data.categories.find(c => c.id === id) || {}).name || "—";

function renderAll() {
  renderBadges(); renderOverview(); renderOrders(); renderProducts(); renderInventory(); renderMessages();
}
function renderBadges() {
  const set = (id, n) => { $(id).hidden = !n; $(id).textContent = n; };
  set("navPending", data.orders.filter(o => o.status === "pending").length);
  set("navLow", data.products.filter(isLow).length);
  set("navUnread", data.messages.filter(m => !m.is_read).length);
}

/* =====================================================================
   OVERVIEW
   ===================================================================== */
function renderOverview() {
  const pending = data.orders.filter(o => o.status === "pending");
  const unpaid = data.orders.filter(o => o.payment_status === "unpaid" && o.status !== "cancelled");
  const low = data.products.filter(isLow);
  const unread = data.messages.filter(m => !m.is_read);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const paidMonth = data.orders.filter(o => o.payment_status === "paid" && new Date(o.created_at) >= monthStart)
                               .reduce((s, o) => s + Number(o.subtotal), 0);
  $("tiles").innerHTML = `
    <a class="tile ${pending.length ? "alert" : ""}" href="#orders" data-goto-filter="pending"><span>New orders to confirm</span><b>${pending.length}</b><small>${pending.length ? "Waiting for you" : "All caught up"}</small></a>
    <a class="tile" href="#orders" data-goto-filter="unpaid"><span>Awaiting payment</span><b>${unpaid.length}</b><small>${fmt(unpaid.reduce((s, o) => s + Number(o.subtotal), 0))} outstanding</small></a>
    <a class="tile ${low.length ? "alert" : ""}" href="#inventory"><span>Low or out of stock</span><b>${low.length}</b><small>${low.length ? "Time to restock" : "Stock looks fine"}</small></a>
    <div class="tile"><span>Paid this month</span><b>${fmt(paidMonth)}</b><small>${unread.length} unread message${unread.length === 1 ? "" : "s"}</small></div>`;
  const recent = data.orders.slice(0, 6);
  $("recentOrders").innerHTML = recent.length ? `<div class="mini">${recent.map(o => `
      <a href="#orders" data-order="${o.id}"><span><b class="mono">${esc(o.order_number)}</b><br><small>${esc(o.customer_name)} · ${dshort(o.created_at)}</small></span>
      <span><span class="os os-${o.status}">${ORDER_STATUS[o.status]}</span> <b>${fmt(o.subtotal)}</b></span></a>`).join("")}</div>`
    : `<p class="none">No orders yet. They'll show up here the moment someone checks out.</p>`;
  $("lowList").innerHTML = low.length ? `<div class="mini">${low.map(p => `
      <div><span><b>${esc(p.name)}</b><br><small>alert at ${p.low_stock_threshold}</small></span><span class="${p.stock ? "neg" : "neg"}">${p.stock} left</span></div>`).join("")}</div>`
    : `<p class="none">Nothing low right now.</p>`;
}
document.addEventListener("click", e => {
  const t = e.target.closest("[data-goto-filter]"); if (t) { orderFilter = t.dataset.gotoFilter; renderOrders(); }
});

/* =====================================================================
   ORDERS
   ===================================================================== */
const ORDER_FILTERS = [["open", "Open"], ["pending", "Pending"], ["confirmed", "Confirmed"], ["in_production", "In production"], ["ready", "Ready"], ["completed", "Completed"], ["cancelled", "Cancelled"], ["unpaid", "Unpaid"], ["all", "All"]];
function filteredOrders() {
  const q = $("orderSearch").value.trim().toLowerCase();
  return data.orders.filter(o =>
    (orderFilter === "all" || (orderFilter === "open" && OPEN.includes(o.status)) ||
     (orderFilter === "unpaid" && o.payment_status === "unpaid" && o.status !== "cancelled") || o.status === orderFilter) &&
    (!q || [o.order_number, o.customer_name, o.email, o.phone].some(v => (v || "").toLowerCase().includes(q))));
}
function renderOrders() {
  const count = k => k === "all" ? data.orders.length : k === "open" ? data.orders.filter(o => OPEN.includes(o.status)).length
    : k === "unpaid" ? data.orders.filter(o => o.payment_status === "unpaid" && o.status !== "cancelled").length : data.orders.filter(o => o.status === k).length;
  $("orderFilters").innerHTML = ORDER_FILTERS.map(([k, l]) => `<button type="button" data-of="${k}" aria-pressed="${k === orderFilter}">${l}<span>${count(k)}</span></button>`).join("");
  const rows = filteredOrders();
  $("ordersTable").querySelector("tbody").innerHTML = rows.map(o => `
    <tr class="click" tabindex="0" data-order="${o.id}">
      <td><b class="mono">${esc(o.order_number)}</b></td>
      <td>${dshort(o.created_at)}<small>${new Date(o.created_at).toLocaleTimeString(SHOP.locale, { hour: "numeric", minute: "2-digit" })}</small></td>
      <td>${esc(o.customer_name)}<small>${esc(o.fulfillment === "delivery" ? "Delivery" : "Pickup")} · ${esc(PAY_METHOD[o.payment_method])}</small></td>
      <td>${o.order_items.reduce((s, i) => s + i.quantity, 0)}</td>
      <td class="num"><b>${fmt(o.subtotal)}</b></td>
      <td><span class="os os-${o.status}">${ORDER_STATUS[o.status]}</span></td>
      <td><span class="os os-${o.payment_status}">${PAY_STATUS[o.payment_status]}</span></td>
    </tr>`).join("");
  $("ordersEmpty").hidden = rows.length > 0;
}
$("orderFilters").addEventListener("click", e => { const b = e.target.closest("[data-of]"); if (b) { orderFilter = b.dataset.of; renderOrders(); } });
$("orderSearch").addEventListener("input", renderOrders);
document.addEventListener("click", e => { const r = e.target.closest("[data-order]"); if (r) openOrder(r.dataset.order); });
$("ordersTable").addEventListener("keydown", e => { const r = e.target.closest("[data-order]"); if (r && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openOrder(r.dataset.order); } });

$("exportOrders").addEventListener("click", () => {
  const rows = [["Order", "Date", "Status", "Payment", "Method", "Customer", "Email", "Phone", "Fulfillment", "Address", "Item", "Personalization", "Qty", "Unit price", "Line total", "Order subtotal", "Customer notes"]];
  filteredOrders().forEach(o => o.order_items.forEach(i => rows.push([o.order_number, dt(o.created_at), ORDER_STATUS[o.status], PAY_STATUS[o.payment_status], PAY_METHOD[o.payment_method],
    o.customer_name, o.email, o.phone, o.fulfillment, o.address, i.product_name, i.customization, i.quantity, i.unit_price, i.line_total, o.subtotal, o.notes])));
  downloadCSV(`cozy-crafts-orders-${new Date().toISOString().slice(0, 10)}.csv`, rows);
});

/* ---------- order sheet ---------- */
const orderSheet = $("orderSheet");
let currentOrder = null;
function openOrder(id) {
  const o = data.orders.find(x => x.id === id); if (!o) return;
  currentOrder = o;
  $("osDate").textContent = "Placed " + dt(o.created_at);
  $("osTitle").textContent = o.order_number;
  const row = (k, v) => v ? `<dt>${k}</dt><dd>${v}</dd>` : "";
  $("osCustomer").innerHTML = row("Customer", esc(o.customer_name)) + row("Email", esc(o.email)) + row("Phone", esc(o.phone)) +
    row("Fulfillment", o.fulfillment === "delivery" ? "Delivery" : "Pickup") + row("Address", esc(o.address)) +
    row("Pays by", PAY_METHOD[o.payment_method]) + row("Notes", esc(o.notes));
  $("osItems").innerHTML = o.order_items.map(i => `<tr><td>${esc(i.product_name)}${i.customization ? `<small>“${esc(i.customization)}”</small>` : ""}</td><td class="num">${i.quantity}</td><td class="num">${fmt(i.unit_price)}</td><td class="num">${fmt(i.line_total)}</td></tr>`).join("");
  $("osTotal").textContent = fmt(o.subtotal);
  $("osStatus").value = o.status; $("osPay").value = o.payment_status; $("osNotes").value = o.admin_notes || "";
  $("osError").hidden = true;
  syncStockHint();
  orderSheet.showModal();
}
function syncStockHint() {
  const o = currentOrder, s = $("osStatus").value;
  $("osStockHint").textContent = s === "cancelled" && o.status !== "cancelled" ? "Saving will put this order's items back in stock."
    : o.status === "cancelled" && s !== "cancelled" ? "Saving will take this order's items out of stock again."
    : "Setting an order to Cancelled puts its items back in stock.";
}
$("osStatus").addEventListener("change", syncStockHint);
$("orderForm").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = $("osSave"); btn.disabled = true;
  const { error } = await supabase.rpc("admin_update_order", {
    p_order_id: currentOrder.id, p_status: $("osStatus").value, p_payment_status: $("osPay").value, p_admin_notes: $("osNotes").value
  });
  btn.disabled = false;
  if (error) { showError($("osError"), error); return; }
  orderSheet.close(); toast(`${currentOrder.order_number} updated.`);
  loadAll();
});
$("osCopy").addEventListener("click", () => {
  const o = currentOrder;
  copyText([o.customer_name, o.phone, o.email, o.fulfillment === "delivery" ? o.address : "Pickup", `Order ${o.order_number} · ${fmt(o.subtotal)}`].filter(Boolean).join("\n"), "Customer details copied.");
});

/* =====================================================================
   PRODUCTS
   ===================================================================== */
const PRODUCT_FILTERS = [["all", "All"], ["orderable", "On sale"], ["coming-soon", "Coming soon"], ["sold-out", "Sold out"], ["concept", "Concepts"], ["hidden", "Hidden"]];
function filteredProducts() {
  const q = $("productSearch").value.trim().toLowerCase();
  return data.products.filter(p => {
    const f = productFilter;
    const ok = f === "all" ? !p.is_archived : f === "hidden" ? p.is_archived : f === "concept" ? p.is_concept && !p.is_archived
      : f === "orderable" ? !p.is_archived && !p.is_concept && ["available", "new"].includes(p.status) : !p.is_archived && p.status === f;
    return ok && (!q || p.name.toLowerCase().includes(q) || p.slug.includes(q));
  });
}
function renderProducts() {
  $("productFilters").innerHTML = PRODUCT_FILTERS.map(([k, l]) => `<button type="button" data-pf="${k}" aria-pressed="${k === productFilter}">${l}</button>`).join("");
  const rows = filteredProducts();
  $("productsTable").querySelector("tbody").innerHTML = rows.map(p => `
    <tr class="click" tabindex="0" data-product="${p.id}">
      <td><div class="thumb ${esc(p.tint)}">${media(p)}</div></td>
      <td><b>${esc(p.name)}</b><small>${p.is_concept ? "Concept · " : ""}/${esc(p.slug)}</small></td>
      <td>${esc(catName(p.category_id))}</td>
      <td class="num">${p.price == null ? "<small>coming soon</small>" : fmt(p.price)}</td>
      <td class="num ${isLow(p) ? "neg" : ""}">${p.stock}</td>
      <td><span class="pill st-${p.status}">${STATUS_LABEL[p.status]}</span></td>
      <td>${p.is_archived ? "Hidden" : p.featured ? "Featured" : "Shop"}</td>
      <td><button type="button" class="btn btn-ghost btn-small" data-product="${p.id}">Edit</button></td>
    </tr>`).join("");
  $("productsEmpty").hidden = rows.length > 0;
}
$("productFilters").addEventListener("click", e => { const b = e.target.closest("[data-pf]"); if (b) { productFilter = b.dataset.pf; renderProducts(); } });
$("productSearch").addEventListener("input", renderProducts);
document.addEventListener("click", e => { const r = e.target.closest("[data-product]"); if (r) openProduct(r.dataset.product); });
$("productsTable").addEventListener("keydown", e => { const r = e.target.closest("tr[data-product]"); if (r && e.key === "Enter") openProduct(r.dataset.product); });
$("newProduct").addEventListener("click", () => openProduct(null));

/* ---------- product sheet ---------- */
const productSheet = $("productSheet");
let editing = null, pendingFile = null, imageUrl = null, slugTouched = false;
$("psArt").innerHTML = ART_KEYS.filter(k => k !== "desk").map(k => `<option value="${k}">${k[0].toUpperCase() + k.slice(1)}</option>`).join("");
const slugify = s => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

function openProduct(id) {
  editing = id ? data.products.find(p => p.id === id) : null;
  const p = editing || { name: "", slug: "", category_id: data.categories[0]?.id, description: "", price: null, stock: 0, low_stock_threshold: 5,
    status: "available", art: "stickers", tint: "bg-blue", featured: false, allow_customization: false, is_concept: false, is_archived: false, sort: 0, image_url: null };
  $("psCat").innerHTML = data.categories.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
  $("psEyebrow").textContent = editing ? "Edit product" : "New product";
  $("psTitle").textContent = editing ? p.name : "Add product";
  $("psName").value = p.name; $("psSlug").value = p.slug; slugTouched = !!editing;
  $("psCat").value = p.category_id || ""; $("psDesc").value = p.description || "";
  $("psPrice").value = p.price ?? ""; $("psStock").value = p.stock; $("psLow").value = p.low_stock_threshold;
  $("psStatus").value = p.status; $("psArt").value = p.art; $("psTint").value = p.tint;
  $("psFeatured").checked = p.featured; $("psCustom").checked = p.allow_customization; $("psConcept").checked = p.is_concept; $("psArchived").checked = p.is_archived;
  $("psSort").value = p.sort;
  $("psStockWrap").hidden = !!editing; $("psStockNote").hidden = !editing; $("psStockNow").textContent = p.stock;
  $("psDelete").hidden = !editing; $("psDelete").classList.remove("armed"); $("psDelete").textContent = "Delete product";
  imageUrl = p.image_url; pendingFile = null; $("psFile").value = "";
  $("psError").hidden = true;
  paintPreview();
  productSheet.showModal();
}
function paintPreview() {
  const pv = $("psPreview");
  pv.className = "img-preview " + $("psTint").value;
  pv.innerHTML = pendingFile ? `<img src="${URL.createObjectURL(pendingFile)}" alt="">` : imageUrl ? `<img src="${esc(imageUrl)}" alt="">` : ART[$("psArt").value];
  $("psRemoveImg").hidden = !(pendingFile || imageUrl);
}
["psArt", "psTint"].forEach(id => $(id).addEventListener("change", paintPreview));
$("psName").addEventListener("input", () => { if (!slugTouched) $("psSlug").value = slugify($("psName").value); });
$("psSlug").addEventListener("input", () => { slugTouched = true; });
$("psFile").addEventListener("change", e => {
  const f = e.target.files[0]; if (!f) return;
  if (f.size > 5 * 1024 * 1024) { toast("That photo is over 5 MB. Please choose a smaller one."); e.target.value = ""; return; }
  pendingFile = f; paintPreview();
});
$("psRemoveImg").addEventListener("click", () => { pendingFile = null; imageUrl = null; $("psFile").value = ""; paintPreview(); });

$("productForm").addEventListener("submit", async e => {
  e.preventDefault();
  const err = $("psError"); err.hidden = true;
  const name = $("psName").value.trim(), slug = slugify($("psSlug").value);
  const priceRaw = $("psPrice").value.trim();
  const price = priceRaw === "" ? null : Number(priceRaw);
  const status = $("psStatus").value, concept = $("psConcept").checked;
  const problems = [];
  if (!name) problems.push("Add a product name.");
  if (!slug) problems.push("Add a web address name.");
  if (price != null && (isNaN(price) || price < 0)) problems.push("Price must be zero or more.");
  if (["available", "new"].includes(status) && !concept && price == null) problems.push("Products on sale need a price. Leave it blank only for Coming Soon.");
  if (problems.length) { err.textContent = problems.join(" "); err.hidden = false; return; }

  const btn = $("psSave"); btn.disabled = true; btn.textContent = "Saving…";
  try {
    let url = imageUrl;
    if (pendingFile) {
      const ext = (pendingFile.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${slug}-${Date.now()}.${ext}`;
      const up = await supabase.storage.from("product-images").upload(path, pendingFile, { cacheControl: "31536000", upsert: false, contentType: pendingFile.type });
      if (up.error) throw up.error;
      url = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
    }
    const row = {
      name, slug, category_id: $("psCat").value || null, description: $("psDesc").value.trim(), price,
      low_stock_threshold: Math.max(0, parseInt($("psLow").value, 10) || 0), status, art: $("psArt").value, tint: $("psTint").value,
      featured: $("psFeatured").checked, allow_customization: $("psCustom").checked, is_concept: concept,
      is_archived: $("psArchived").checked, sort: parseInt($("psSort").value, 10) || 0, image_url: url
    };
    let res;
    if (editing) res = await supabase.from("products").update(row).eq("id", editing.id).select().single();
    else res = await supabase.from("products").insert({ ...row, stock: Math.max(0, parseInt($("psStock").value, 10) || 0) }).select().single();
    if (res.error) throw (/duplicate key.*slug/i.test(res.error.message) ? new Error("Another product already uses that web address name.") : res.error);
    productSheet.close();
    toast(editing ? "Product saved." : "Product added.");
    if (res.data.status !== status) toast(`Saved. Status changed to ${STATUS_LABEL[res.data.status]} because stock is ${res.data.stock}.`);
    loadAll();
  } catch (ex) { showError(err, ex); }
  finally { btn.disabled = false; btn.textContent = "Save product"; }
});

$("psDelete").addEventListener("click", async e => {
  const b = e.currentTarget;
  if (!b.classList.contains("armed")) { b.classList.add("armed"); b.textContent = "Click again to delete"; setTimeout(() => { b.classList.remove("armed"); b.textContent = "Delete product"; }, 4000); return; }
  const { error } = await supabase.from("products").delete().eq("id", editing.id);
  if (error) { showError($("psError"), error); return; }
  productSheet.close(); toast("Product deleted. Past orders keep their item names."); loadAll();
});

/* =====================================================================
   INVENTORY
   ===================================================================== */
function renderInventory() {
  const list = data.products.filter(p => !p.is_archived && !p.is_concept)
    .sort((a, b) => (isLow(b) - isLow(a)) || a.name.localeCompare(b.name));
  $("stockTable").querySelector("tbody").innerHTML = list.length ? list.map(p => {
    const level = p.stock === 0 ? ["Out", "var(--peach)", 0] : isLow(p) ? ["Low", "var(--peach)", 30] : ["Good", "var(--sage)", 100];
    const pct = p.stock === 0 ? 0 : Math.min(100, Math.round(p.stock / Math.max(1, p.low_stock_threshold * 3) * 100));
    return `<tr>
      <td><b>${esc(p.name)}</b><small>${STATUS_LABEL[p.status]}${p.price != null ? " · " + fmt(p.price) : ""}</small></td>
      <td class="num"><b>${p.stock}</b></td>
      <td class="num">${openQty(p.id) || "—"}</td>
      <td class="num">${p.low_stock_threshold}</td>
      <td><span class="lvl" style="--c:${level[1]};--w:${Math.max(pct, p.stock ? 8 : 0)}%"><i></i>${level[0]}</span></td>
      <td><button type="button" class="btn btn-ghost btn-small" data-adjust="${p.id}">Adjust</button></td></tr>`;
  }).join("") : `<tr><td colspan="6" class="empty-row">No products on sale yet. Concept pieces don't have stock.</td></tr>`;

  $("moveTable").querySelector("tbody").innerHTML = data.moves.length ? data.moves.map(m => `<tr>
      <td>${dt(m.created_at)}</td><td>${esc(m.products?.name || "Deleted product")}</td>
      <td class="num ${m.change > 0 ? "pos" : "neg"}">${m.change > 0 ? "+" : ""}${m.change}</td><td class="num">${m.stock_after}</td>
      <td>${REASON[m.reason] || m.reason}</td><td>${m.orders?.order_number ? `<span class="mono">${esc(m.orders.order_number)}</span>` : esc(m.note || "")}</td></tr>`).join("")
    : `<tr><td colspan="6" class="empty-row">No stock changes yet.</td></tr>`;
}
$("exportStock").addEventListener("click", () => {
  const rows = [["Product", "Slug", "Status", "Price", "In stock", "In open orders", "Low stock alert"]];
  data.products.filter(p => !p.is_archived && !p.is_concept).forEach(p => rows.push([p.name, p.slug, STATUS_LABEL[p.status], p.price, p.stock, openQty(p.id), p.low_stock_threshold]));
  downloadCSV(`cozy-crafts-stock-${new Date().toISOString().slice(0, 10)}.csv`, rows);
});

/* ---------- adjust sheet ---------- */
const stockSheet = $("stockSheet");
let adjusting = null;
document.addEventListener("click", e => {
  const b = e.target.closest("[data-adjust]"); if (!b) return;
  adjusting = data.products.find(p => p.id === b.dataset.adjust);
  $("ssTitle").textContent = adjusting.name; $("ssNow").textContent = adjusting.stock;
  $("ssChange").value = ""; $("ssNote").value = ""; $("ss-restock").checked = true; $("ssError").hidden = true;
  paintAfter(); stockSheet.showModal(); $("ssChange").focus();
});
function paintAfter() { const c = parseInt($("ssChange").value, 10) || 0; $("ssAfter").textContent = adjusting.stock + c; }
$("ssChange").addEventListener("input", paintAfter);
$("stockForm").addEventListener("submit", async e => {
  e.preventDefault();
  const change = parseInt($("ssChange").value, 10);
  if (!change) { $("ssError").textContent = "Enter how many to add (or a negative number to remove)."; $("ssError").hidden = false; return; }
  const btn = $("ssSave"); btn.disabled = true;
  const { data: p, error } = await supabase.rpc("admin_adjust_stock", {
    p_product_id: adjusting.id, p_change: change, p_reason: document.querySelector('input[name="ssReason"]:checked').value, p_note: $("ssNote").value.trim() || null
  });
  btn.disabled = false;
  if (error) { showError($("ssError"), error); return; }
  stockSheet.close(); toast(`${adjusting.name}: ${p.stock} in stock.`); loadAll();
});

/* =====================================================================
   MESSAGES
   ===================================================================== */
function renderMessages() {
  $("msgList").innerHTML = data.messages.length ? data.messages.map(m => `
    <article class="msg ${m.is_read ? "" : "unread"}">
      <div class="msg-top"><b>${esc(m.name)} <span class="chip">· ${esc(m.topic)}</span></b><small>${dt(m.created_at)}</small></div>
      <a href="mailto:${esc(m.email)}">${esc(m.email)}</a>
      <p>${esc(m.message)}</p>
      <div class="msg-actions">
        <button type="button" class="link-btn" data-read="${m.id}" data-val="${!m.is_read}">${m.is_read ? "Mark as unread" : "Mark as read"}</button>
        <button type="button" class="link-btn" data-copy-email="${esc(m.email)}">Copy email</button>
        <button type="button" class="link-btn danger" data-del-msg="${m.id}">Delete</button>
      </div>
    </article>`).join("") : `<div class="empty stitch"><h3>No messages yet</h3><p>Messages from the contact form on your site land here.</p></div>`;
}
$("msgList").addEventListener("click", async e => {
  const r = e.target.closest("[data-read]"), c = e.target.closest("[data-copy-email]"), d = e.target.closest("[data-del-msg]");
  if (c) copyText(c.dataset.copyEmail, "Email copied.");
  if (r) {
    const { error } = await supabase.from("messages").update({ is_read: r.dataset.val === "true" }).eq("id", r.dataset.read);
    if (error) return toast(friendlyError(error));
    const m = data.messages.find(x => x.id === r.dataset.read); m.is_read = r.dataset.val === "true"; renderMessages(); renderBadges(); renderOverview();
  }
  if (d) {
    if (!d.classList.contains("armed")) { d.classList.add("armed"); d.textContent = "Click again to delete"; return; }
    const { error } = await supabase.from("messages").delete().eq("id", d.dataset.delMsg);
    if (error) return toast(friendlyError(error));
    data.messages = data.messages.filter(x => x.id !== d.dataset.delMsg); renderMessages(); renderBadges(); toast("Message deleted.");
  }
});

/* =====================================================================
   ROUTING + SHEETS
   ===================================================================== */
const TABS = ["overview", "orders", "products", "inventory", "messages"];
function route() {
  const h = location.hash.slice(1);
  const tab = TABS.includes(h) ? h : "overview";
  document.querySelectorAll("[data-panel]").forEach(p => (p.hidden = p.dataset.panel !== tab));
  document.querySelectorAll("[data-tab]").forEach(a => a.dataset.tab === tab ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  scrollTo(0, 0);
}
addEventListener("hashchange", route);
document.querySelectorAll("dialog.sheet").forEach(d => {
  d.addEventListener("click", e => { if (e.target === d || e.target.closest("[data-close]")) d.close(); });
});

boot();

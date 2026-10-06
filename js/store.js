/* =====================================================================
   Cozy Crafts — storefront
   Products come from Supabase. If Supabase isn't configured yet (or can't
   be reached), the site falls back to the built-in concept pieces below,
   so it never looks broken.
   ===================================================================== */
import { supabase, isConfigured, friendlyError } from "./supabase.js";
import { SHOP } from "./config.js";
import { ART, SOC_ICON, STATUS_LABEL, esc } from "./shared.js";

/* Add a real link with url:"https://..." when an account exists. */
const SOCIALS = [
  { name: "Facebook",  mark: "f",  url: null },
  { name: "Instagram", mark: "ig", url: null },
  { name: "TikTok",    mark: "tt", url: null },
  { name: "Pinterest", mark: "p",  url: null }
];

/* ---------- fallback content (used only without a database) ---------- */
const FALLBACK_CATEGORIES = [
  { id: "stickers",     name: "Stickers",             blurb: "Cute and creative sticker designs.",               icon: "stickers", tint: "bg-blue" },
  { id: "digital-art",  name: "Digital Artwork",      blurb: "Original digital illustrations and prints.",       icon: "print",    tint: "bg-peach" },
  { id: "stationery",   name: "Stationery",           blurb: "Creative paper goods and printable designs.",      icon: "notebook", tint: "bg-sage" },
  { id: "personalized", name: "Personalized Crafts",  blurb: "Custom pieces made around a name or memory.",      icon: "tag",      tint: "bg-beige" },
  { id: "gifts",        name: "Gift Ideas",           blurb: "Small creative items made for giving.",            icon: "gift",     tint: "bg-peach" },
  { id: "seasonal",     name: "Seasonal Collections", blurb: "Little collections for holidays and special days.", icon: "bookmark", tint: "bg-blue" }
];
const concept = (id, name, category, description, art, tint, custom = false) =>
  ({ id, slug: id, name, category, description, price: null, stock: 0, status: "coming-soon", image: null, art, tint, concept: true, featured: true, custom });
const FALLBACK_PRODUCTS = [
  concept("cozy-stickers", "Cozy Sticker Collection", "stickers", "A first set of sticker designs is being sketched. New sticker designs coming soon.", "stickers", "bg-blue"),
  concept("mini-prints", "Mini Art Prints", "digital-art", "Small illustrated prints for desks and shelves. Our first collection is currently in progress.", "print", "bg-peach"),
  concept("stationery-set", "Cute Stationery", "stationery", "Notepads, cards and printable paper goods. More designs coming soon.", "notebook", "bg-sage"),
  concept("name-tags", "Personalized Name Tags", "personalized", "Custom pieces made around a name, date or little detail. Product details coming soon.", "tag", "bg-beige", true),
  concept("gift-bundles", "Little Gift Bundles", "gifts", "Small creative pieces put together for giving. More details coming soon.", "gift", "bg-peach"),
  concept("bookmarks", "Illustrated Bookmarks", "stationery", "Bookmarks with little illustrations for your reading pile. Product details coming soon.", "bookmark", "bg-blue")
];

/* ---------- state ---------- */
let CATEGORIES = FALLBACK_CATEGORIES;
let PRODUCTS = FALLBACK_PRODUCTS;
let live = false;                       // true once products came from the database
let activeCat = "all";
const $ = id => document.getElementById(id);
const money = new Intl.NumberFormat(SHOP.locale, { style: "currency", currency: SHOP.currency });
const fmt = n => money.format(Number(n) || 0);
const catName = id => (CATEGORIES.find(c => c.id === id) || {}).name || "";
const byId = id => PRODUCTS.find(p => p.id === id);
const orderable = p => !!p && live && !p.concept && p.price != null && (p.status === "available" || p.status === "new") && p.stock > 0;

/* ---------- storage helpers (never let storage break the page) ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

/* ---------- toast ---------- */
const toastEl = $("toast"); let toastT;
function toast(msg) { toastEl.textContent = msg; toastEl.classList.remove("hide"); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.add("hide"), 3400); }
document.addEventListener("click", e => { const b = e.target.closest("[data-soon]"); if (b) toast(b.dataset.soon); });

async function copyText(text, okMsg) {
  try { await navigator.clipboard.writeText(text); toast(okMsg); }
  catch { toast("Couldn't copy automatically. Please select and copy it yourself."); }
}

/* =====================================================================
   DATA
   ===================================================================== */
async function loadCatalog() {
  if (!isConfigured) return;
  try {
    const [cats, prods] = await Promise.all([
      supabase.from("categories").select("*").order("sort"),
      supabase.from("products").select("*").eq("is_archived", false).order("sort").order("created_at")
    ]);
    if (cats.error) throw cats.error;
    if (prods.error) throw prods.error;
    if (cats.data.length) CATEGORIES = cats.data.map(c => ({ id: c.id, name: c.name, blurb: c.blurb, icon: c.icon, tint: c.tint }));
    PRODUCTS = prods.data.map(r => ({
      id: r.id, slug: r.slug, name: r.name, category: r.category_id, description: r.description,
      price: r.price === null ? null : Number(r.price), stock: r.stock, status: r.status,
      image: r.image_url, art: r.art, tint: r.tint, concept: r.is_concept, featured: r.featured, custom: r.allow_customization
    }));
    live = true;
  } catch (err) {
    console.warn("[Cozy Crafts] Using built-in content:", friendlyError(err));
  }
}

/* =====================================================================
   RENDERING
   ===================================================================== */
function mediaHTML(p) {
  return p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">` : (ART[p.art] || ART.stickers);
}

function cardHTML(p) {
  const canOrder = orderable(p);
  let cta;
  if (canOrder) cta = p.custom
    ? `<button type="button" class="btn btn-primary btn-small" data-qv="${p.id}">Personalize</button>`
    : `<button type="button" class="btn btn-primary btn-small" data-add="${p.id}">Add to cart</button>`;
  else if (p.status === "sold-out") cta = `<a class="btn btn-ghost btn-small" href="#contact" data-ask="${esc(p.name)}">Ask about restock</a>`;
  else cta = `<a class="btn btn-ghost btn-small" href="#contact" data-ask="${esc(p.name)}">Ask about this</a>`;
  const hint = canOrder && p.stock <= SHOP.lowStockHint ? `<span class="low">Only ${p.stock} left</span>` : "";
  return `<article class="card">
    <button type="button" class="media-btn" data-qv="${p.id}" aria-label="Quick view: ${esc(p.name)}">
      <div class="card-media ${esc(p.tint || "bg-beige")}">${mediaHTML(p)}${p.concept ? '<span class="concept">Concept</span>' : ""}</div>
    </button>
    <div class="card-body">
      <div class="card-top"><span class="chip">${esc(catName(p.category))}</span><span class="pill st-${p.status}">${STATUS_LABEL[p.status]}</span></div>
      <h3><button type="button" class="name-btn" data-qv="${p.id}">${esc(p.name)}</button></h3>
      <p>${esc(p.description)}</p>
      ${hint}
      <div class="card-foot">
        ${p.price != null && !p.concept ? `<span class="price">${fmt(p.price)}</span>` : `<span class="price tbd">Price coming soon</span>`}
        ${cta}
      </div>
    </div></article>`;
}

function emptyHTML(cat) {
  return `<div class="empty stitch">${ART.bookmark.replace('viewBox="0 0 200 160"', 'viewBox="60 0 90 160" aria-hidden="true"')}
    <h3>More designs coming soon</h3>
    <p>${cat ? `We're working on the first ${esc(cat.name.toLowerCase())}. ` : ""}New craft collections are currently in the works.</p>
    <a class="btn btn-ghost" href="#contact" data-topic="custom">Suggest an idea</a></div>`;
}

function renderHome() {
  document.querySelectorAll("[data-art]").forEach(el => {
    el.innerHTML = ART[el.dataset.art];
    if (el.dataset.bg) { el.classList.add(el.dataset.bg); el.style.borderRadius = "12px"; }
  });
  const catOpen = id => PRODUCTS.some(p => p.category === id && orderable(p));
  $("catGrid").innerHTML = CATEGORIES.map(c => `
    <a class="cat" href="#shop-${esc(c.id)}">
      <span class="ico ${esc(c.tint)}" aria-hidden="true">${ART[c.icon] || ART.stickers}</span>
      <div><div class="meta"><h3>${esc(c.name)}</h3><span class="pill st-${catOpen(c.id) ? "available" : "coming-soon"}">${catOpen(c.id) ? "Open" : "Coming Soon"}</span></div>
      <p>${esc(c.blurb)}</p></div></a>`).join("");

  // Featured: orderable featured items first, then the rest of the featured list.
  const featured = PRODUCTS.filter(p => p.featured).sort((a, b) => orderable(b) - orderable(a)).slice(0, 6);
  $("featGrid").innerHTML = (featured.length ? featured : PRODUCTS.slice(0, 6)).map(cardHTML).join("") || "";
  $("footCats").innerHTML = `<li><a href="#shop">All creations</a></li>` +
    CATEGORIES.slice(0, 5).map(c => `<li><a href="#shop-${esc(c.id)}">${esc(c.name)}</a></li>`).join("");

  $("socialGrid").innerHTML = SOCIALS.map(s => s.url
    ? `<a class="social" href="${esc(s.url)}" target="_blank" rel="noopener"><span class="ico">${SOC_ICON[s.mark]}</span><b>${s.name}</b><span>follow us</span></a>`
    : `<button type="button" class="social" data-soon="${s.name} is coming soon. We'll add the link here once the account is ready."><span class="ico" aria-hidden="true">${SOC_ICON[s.mark]}</span><b>${s.name}</b><span>coming soon</span></button>`).join("");

  const anyOrderable = PRODUCTS.some(orderable);
  if (anyOrderable) $("heroShopBtn").innerHTML = "Shop now";
}

function renderShop() {
  const anyOrderable = PRODUCTS.some(orderable);
  $("shopBannerTitle").textContent = anyOrderable ? "Fresh from the craft table." : "Our shop is getting ready.";
  $("shopBannerText").textContent = anyOrderable
    ? "Order online and pay after we confirm your order. Pieces marked Coming Soon will open for orders soon."
    : "New creations will be available here soon. For now, here's a look at what's being prepared.";

  const filters = [{ id: "all", name: "All" }].concat(CATEGORIES);
  $("filters").innerHTML = filters.map(c => `<button type="button" data-cat="${esc(c.id)}" aria-pressed="${c.id === activeCat}">${esc(c.name)}</button>`).join("");
  const cat = CATEGORIES.find(c => c.id === activeCat);
  const items = PRODUCTS.filter(p => activeCat === "all" || p.category === activeCat)
                        .sort((a, b) => orderable(b) - orderable(a));
  $("shopTitle").textContent = cat ? cat.name : "All creations";
  const n = items.filter(orderable).length;
  $("shopSub").textContent = items.length ? (n ? `${n} ready to order` : "Concept pieces · coming soon") : "Nothing here yet";
  $("shopGrid").innerHTML = items.length ? `<div class="grid">${items.map(cardHTML).join("")}</div>` : emptyHTML(cat);
}
$("filters").addEventListener("click", e => {
  const b = e.target.closest("button[data-cat]"); if (!b) return;
  location.hash = b.dataset.cat === "all" ? "shop" : "shop-" + b.dataset.cat;
});

/* ---------- style guide ---------- */
function renderStyleguide() {
  const SW = [["Paper","--paper","Page ground"],["Paper 2","--paper-2","Panels"],["Card","--card","Cards, die-cut"],["Ink","--ink","Text"],["Ink soft","--ink-soft","Secondary text"],["Blue","--blue","Brand, buttons"],["Blue soft","--blue-soft","Brand tint"],["Peach","--peach","Coming soon"],["Peach soft","--peach-soft","Warm tint"],["Sage","--sage","Available"],["Sage soft","--sage-soft","Calm tint"],["White","--white","Clean sections"],["Sky","--sky","Light blue sections"],["Line","--line","Borders, stitches"]];
  $("swatches").innerHTML = SW.map(([n, v, u]) => `<div class="sw"><i style="background:var(${v})"></i><div><b>${n}</b><code>${v}</code><br>${u}</div></div>`).join("");
  const sample = { name: "Product name", category: "stickers", description: "Short product description goes here.", art: "stickers", concept: false };
  $("sgCards").innerHTML = [
    { ...sample, status: "available", price: 0, tint: "bg-sage", art: "notebook" },
    { ...sample, status: "new", price: 0, tint: "bg-blue" },
    { ...sample, status: "coming-soon", price: null, tint: "bg-peach", art: "print", concept: true },
    { ...sample, status: "sold-out", price: 0, tint: "bg-beige", art: "gift" }
  ].map(cardHTML).join("").replace(/data-(ask|qv|add)="[^"]*"/g, "").replace(/₱0\.00/g, "Price");
}

/* =====================================================================
   QUICK VIEW
   ===================================================================== */
const qv = $("quickView");
let qvProduct = null;
function openQV(id) {
  const p = byId(id); if (!p) return;
  qvProduct = p;
  const m = $("qvMedia");
  m.className = "qv-media " + (p.tint || "bg-beige");
  m.innerHTML = mediaHTML(p) + (p.concept ? '<span class="concept">Concept illustration</span>' : "");
  $("qvCat").textContent = catName(p.category);
  const st = $("qvStatus"); st.className = "pill st-" + p.status; st.textContent = STATUS_LABEL[p.status];
  $("qvTitle").textContent = p.name;
  $("qvDesc").textContent = p.description;
  $("qvPrice").textContent = p.price != null && !p.concept ? fmt(p.price) : "price coming soon";

  const can = orderable(p);
  $("qvStockRow").hidden = !live || p.concept;
  $("qvStock").textContent = can ? (p.stock <= SHOP.lowStockHint ? `only ${p.stock} left` : "in stock") : p.status === "sold-out" ? "sold out for now" : "coming soon";
  $("qvSoonRow").hidden = !p.concept && live;
  $("qvOrder").hidden = !can;
  $("qvAdd").hidden = !can;
  $("qvCustomWrap").hidden = !(can && p.custom);
  $("qvCustom").value = "";
  const qty = $("qvQty"); qty.value = 1; qty.max = Math.max(1, p.stock);
  const ask = $("qvAsk");
  ask.hidden = can;
  ask.dataset.ask = p.name;
  ask.textContent = p.status === "sold-out" ? "Ask about restock" : "Ask about this";
  $("qvMore").href = "#shop-" + p.category;
  qv.showModal ? qv.showModal() : qv.setAttribute("open", "");
}
const closeQV = () => (qv.close ? qv.close() : qv.removeAttribute("open"));
document.addEventListener("click", e => { const b = e.target.closest("[data-qv]"); if (b) openQV(b.dataset.qv); });
$("qvClose").addEventListener("click", closeQV);
qv.addEventListener("click", e => { if (e.target === qv) closeQV(); });
$("qvAsk").addEventListener("click", closeQV);
$("qvMore").addEventListener("click", closeQV);
$("qvOrder").addEventListener("submit", e => {
  e.preventDefault();
  if (!qvProduct) return;
  const ok = addToCart(qvProduct.id, Number($("qvQty").value) || 1, $("qvCustom").value.trim());
  if (ok) closeQV();
});

/* steppers (quick view + cart) */
document.addEventListener("click", e => {
  const b = e.target.closest(".stepper [data-step]"); if (!b) return;
  const input = b.parentElement.querySelector("input");
  const max = Number(input.max) || 100;
  input.value = Math.min(max, Math.max(1, (Number(input.value) || 1) + Number(b.dataset.step)));
  input.dispatchEvent(new Event("change", { bubbles: true }));
});

/* =====================================================================
   CART  — [{ key, id, qty, custom }] kept in this browser
   ===================================================================== */
let cart = store.get("cc-cart", []).filter(l => l && l.id && l.qty > 0);
const saveCart = () => { store.set("cc-cart", cart); paintCartCount(); };
const cartLines = () => cart.map(l => ({ ...l, p: byId(l.id) })).filter(l => orderable(l.p));
const cartTotal = () => cartLines().reduce((s, l) => s + l.p.price * l.qty, 0);
const cartQty = () => cartLines().reduce((s, l) => s + l.qty, 0);

function paintCartCount() {
  const n = cartQty();
  const badge = $("cartCount");
  badge.hidden = n === 0; badge.textContent = n > 99 ? "99+" : n;
  $("cartBtn").setAttribute("aria-label", `Open cart, ${n} item${n === 1 ? "" : "s"}`);
}

function addToCart(id, qty = 1, custom = "") {
  const p = byId(id);
  if (!orderable(p)) { toast("Sorry, that item isn't available to order right now."); return false; }
  const key = id + "|" + custom;
  const inCart = cart.filter(l => l.id === id).reduce((s, l) => s + l.qty, 0);
  const room = p.stock - inCart;
  if (room <= 0) { toast(`You already have all ${p.stock} in your cart.`); return false; }
  const add = Math.min(qty, room);
  const line = cart.find(l => l.key === key);
  if (line) line.qty += add; else cart.push({ key, id, qty: add, custom });
  saveCart(); renderCart();
  toast(add < qty ? `Added ${add} — that's all we have in stock.` : `${p.name} added to your cart.`);
  return true;
}

function renderCart() {
  // once real stock is known: drop items that can't be ordered, clamp to stock
  if (live) {
    const before = cart.length;
    cart = cart.filter(l => orderable(byId(l.id)));
    if (cart.length < before) toast("Some items in your cart are no longer available and were removed.");
    for (const id of new Set(cart.map(l => l.id))) {
      const p = byId(id); let left = p.stock;
      cart.filter(l => l.id === id).forEach(l => { l.qty = Math.min(l.qty, left); left -= l.qty; });
    }
    cart = cart.filter(l => l.qty > 0);
    store.set("cc-cart", cart);
  }
  paintCartCount();

  const lines = cartLines();
  $("cartFoot").hidden = lines.length === 0;
  $("cartBody").innerHTML = lines.length ? lines.map(l => `
    <div class="line">
      <div class="line-thumb ${esc(l.p.tint || "bg-beige")}">${mediaHTML(l.p)}</div>
      <div class="line-info">
        <div class="line-top"><b>${esc(l.p.name)}</b><span>${fmt(l.p.price * l.qty)}</span></div>
        <small>${fmt(l.p.price)} each${l.custom ? ` · “${esc(l.custom)}”` : ""}</small>
        <div class="line-ctrl">
          <div class="stepper sm" role="group" aria-label="Quantity for ${esc(l.p.name)}">
            <button type="button" data-step="-1" aria-label="Decrease">−</button>
            <input type="number" min="1" max="${l.p.stock}" value="${l.qty}" data-line="${esc(l.key)}" inputmode="numeric" aria-label="Quantity">
            <button type="button" data-step="1" aria-label="Increase">+</button>
          </div>
          <button type="button" class="link-btn" data-remove="${esc(l.key)}">Remove</button>
        </div>
      </div>
    </div>`).join("")
    : `<div class="cart-empty">${ART.gift}<h3>Your cart is empty</h3><p class="hint">${live && PRODUCTS.some(orderable) ? "Find something cozy in the shop." : "Our first collection is being prepared. Ordering opens soon."}</p><a class="btn btn-ghost" href="#shop" data-close-cart>Browse the shop</a></div>`;
  $("cartTotal").textContent = fmt(cartTotal());
  if (currentView === "checkout") renderCheckout();
}

const drawer = $("cartDrawer");
const openCart = () => { renderCart(); drawer.showModal ? drawer.showModal() : drawer.setAttribute("open", ""); };
const closeCart = () => (drawer.close ? drawer.close() : drawer.removeAttribute("open"));
$("cartBtn").addEventListener("click", openCart);
$("cartClose").addEventListener("click", closeCart);
drawer.addEventListener("click", e => {
  if (e.target === drawer || e.target.closest("[data-close-cart]") || e.target.closest("#toCheckout") || e.target.closest('a[href="#track"]')) closeCart();
  const rm = e.target.closest("[data-remove]");
  if (rm) { cart = cart.filter(l => l.key !== rm.dataset.remove); saveCart(); renderCart(); }
});
drawer.addEventListener("change", e => {
  const input = e.target.closest("input[data-line]"); if (!input) return;
  const line = cart.find(l => l.key === input.dataset.line); if (!line) return;
  line.qty = Math.max(1, Number(input.value) || 1);
  const p = byId(line.id);
  const others = cart.filter(l => l.id === line.id && l !== line).reduce((s, l) => s + l.qty, 0);
  if (line.qty + others > p.stock) { line.qty = Math.max(1, p.stock - others); toast(`Only ${p.stock} in stock.`); }
  saveCart(); renderCart();
});
document.addEventListener("click", e => { const b = e.target.closest("[data-add]"); if (b) addToCart(b.dataset.add, 1); });

/* =====================================================================
   CHECKOUT
   ===================================================================== */
function renderCheckout() {
  const lines = cartLines();
  $("checkoutWrap").hidden = lines.length === 0;
  $("checkoutEmpty").hidden = lines.length > 0;
  $("sumList").innerHTML = lines.map(l => `<li><div><b>${esc(l.p.name)}</b> × ${l.qty}<br><span>${l.custom ? "“" + esc(l.custom) + "”" : fmt(l.p.price) + " each"}</span></div><b>${fmt(l.p.price * l.qty)}</b></li>`).join("");
  $("sumTotal").textContent = fmt(cartTotal());
}
$("checkoutForm").addEventListener("input", e => { $("checkoutError").hidden = true; e.target.removeAttribute("aria-invalid"); });
document.querySelectorAll('input[name="fulfillment"]').forEach(r => r.addEventListener("change", () => {
  $("addrWrap").hidden = document.querySelector('input[name="fulfillment"]:checked').value !== "delivery";
}));

$("checkoutForm").addEventListener("submit", async e => {
  e.preventDefault();
  const err = $("checkoutError"); err.hidden = true;
  const val = id => $(id).value.trim();
  const fulfillment = document.querySelector('input[name="fulfillment"]:checked').value;
  const problems = [];
  if (val("c-name").length < 2) problems.push(["c-name", "Please enter your name."]);
  if (val("c-phone").replace(/\D/g, "").length < 7) problems.push(["c-phone", "Please enter a mobile number we can reach."]);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val("c-email"))) problems.push(["c-email", "Please enter a valid email address."]);
  if (fulfillment === "delivery" && !val("c-address")) problems.push(["c-address", "Please enter a delivery address."]);
  ["c-name", "c-phone", "c-email", "c-address"].forEach(id => $(id).removeAttribute("aria-invalid"));
  if (problems.length) {
    problems.forEach(([id]) => $(id).setAttribute("aria-invalid", "true"));
    err.textContent = problems.map(p => p[1]).join(" "); err.hidden = false; $(problems[0][0]).focus(); return;
  }
  if (!isConfigured) { err.textContent = "Online ordering isn't switched on yet. Please use the contact form for now."; err.hidden = false; return; }

  const lines = cartLines();
  if (!lines.length) { renderCheckout(); return; }
  const btn = $("placeBtn"); btn.disabled = true; btn.textContent = "Placing your order…";
  const customer = {
    name: val("c-name"), email: val("c-email"), phone: val("c-phone"), fulfillment,
    address: fulfillment === "delivery" ? val("c-address") : "",
    payment_method: document.querySelector('input[name="payment"]:checked').value, notes: val("c-notes")
  };
  const items = lines.map(l => ({ product_id: l.id, quantity: l.qty, customization: l.custom || "" }));
  const { data, error } = await supabase.rpc("place_order", { p_customer: customer, p_items: items });
  btn.disabled = false; btn.textContent = "Place order";
  if (error) {
    err.textContent = friendlyError(error); err.hidden = false;
    await loadCatalog(); renderAll();     // refresh stock so the cart reflects reality
    return;
  }
  cart = []; saveCart();
  try { sessionStorage.setItem("cc-last-order", JSON.stringify({ number: data.order_number, email: customer.email, name: customer.name })); } catch {}
  lastOrder = { number: data.order_number, email: customer.email, name: customer.name };
  $("checkoutForm").reset(); $("addrWrap").hidden = true;
  location.hash = "order-placed";
  loadCatalog().then(renderAll);
});

/* ---------- order placed ---------- */
let lastOrder = (() => { try { return JSON.parse(sessionStorage.getItem("cc-last-order")); } catch { return null; } })();
function renderPlaced() {
  if (!lastOrder) { location.hash = "track"; return; }
  $("placedTitle").textContent = `Thank you, ${lastOrder.name.split(" ")[0]}! Your order is in.`;
  $("placedNumber").textContent = lastOrder.number;
}
$("copyOrderNo").addEventListener("click", () => lastOrder && copyText(lastOrder.number, "Order number copied."));
$("placedTrack").addEventListener("click", () => {
  if (!lastOrder) return;
  $("t-number").value = lastOrder.number; $("t-email").value = lastOrder.email;
  setTimeout(() => $("trackForm").requestSubmit(), 50);
});

/* =====================================================================
   TRACK ORDER
   ===================================================================== */
const STEPS = [["pending", "Received"], ["confirmed", "Confirmed"], ["in_production", "Being made"], ["ready", "Ready"], ["completed", "Completed"]];
const PAY = { unpaid: "Not paid yet", paid: "Paid", refunded: "Refunded" };
const PAY_METHOD = { gcash: "GCash", bank_transfer: "Bank transfer", cash: "Cash" };
$("trackForm").addEventListener("submit", async e => {
  e.preventDefault();
  const err = $("trackError"), out = $("trackResult");
  err.hidden = true; out.hidden = true;
  const number = $("t-number").value.trim(), email = $("t-email").value.trim();
  if (!number || !email) { err.textContent = "Please enter your order number and email."; err.hidden = false; return; }
  if (!isConfigured) { err.textContent = "Order tracking isn't switched on yet."; err.hidden = false; return; }
  const btn = $("trackBtn"); btn.disabled = true; btn.textContent = "Checking…";
  const { data, error } = await supabase.rpc("track_order", { p_order_number: number, p_email: email });
  btn.disabled = false; btn.textContent = "Check status";
  if (error) { err.textContent = friendlyError(error); err.hidden = false; return; }
  if (!data) { err.textContent = "We couldn't find an order with that number and email. Check both and try again."; err.hidden = false; return; }

  const idx = STEPS.findIndex(s => s[0] === data.status);
  const placed = new Date(data.created_at).toLocaleString(SHOP.locale, { dateStyle: "medium", timeStyle: "short" });
  out.innerHTML = `
    <div class="track-head">
      <div><h2>${esc(data.order_number)}</h2><p>Placed ${esc(placed)} · ${data.fulfillment === "delivery" ? "Delivery" : "Pickup"}</p></div>
      <span class="pill ${data.payment_status === "paid" ? "st-available" : "st-coming-soon"}">${PAY[data.payment_status]} · ${PAY_METHOD[data.payment_method] || ""}</span>
    </div>
    ${data.status === "cancelled"
      ? `<p class="cancel-note"><b>This order was cancelled.</b> If that's unexpected, send us a message and we'll help.</p>`
      : `<ol class="steps">${STEPS.map(([k, label], i) => `<li class="${i <= idx ? "done" : ""} ${i === idx ? "current" : ""}"><span class="dot">${i <= idx ? "✓" : ""}</span>${label}</li>`).join("")}</ol>`}
    <ul class="sum-list">${data.items.map(i => `<li><div><b>${esc(i.name)}</b> × ${i.quantity}<br><span>${i.customization ? "“" + esc(i.customization) + "”" : fmt(i.unit_price) + " each"}</span></div><b>${fmt(i.line_total)}</b></li>`).join("")}</ul>
    <div class="sum-total"><span>Subtotal</span><b>${fmt(data.subtotal)}</b></div>`;
  out.hidden = false;
});

/* =====================================================================
   CONTACT FORM → messages table
   ===================================================================== */
if (isConfigured) $("formNote").textContent = "We usually reply by email.";
document.addEventListener("click", e => {
  const a = e.target.closest("[data-ask],[data-topic]"); if (!a) return;
  if (a.closest("#sgCards")) return;
  const msg = $("f-msg");
  if (a.dataset.ask) {
    $("t-product").checked = true;
    if (!msg.value.trim()) msg.value = `Hi! I'd love to know more about the ${a.dataset.ask}.`;
    toast(`${a.dataset.ask} added to your message below.`);
  } else if (a.dataset.topic) {
    $({ custom: "t-custom", general: "t-general", collab: "t-collab" }[a.dataset.topic] || "t-general").checked = true;
  }
  if (location.hash === "#contact") { e.preventDefault(); $("contact").scrollIntoView(); }
});

$("contactForm").addEventListener("submit", async e => {
  e.preventDefault();
  const name = $("f-name"), email = $("f-email"), msg = $("f-msg");
  const checks = [[name, "e-name", name.value.trim() !== ""], [email, "e-email", /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())], [msg, "e-msg", msg.value.trim() !== ""]];
  let first = null;
  checks.forEach(([el, errId, ok]) => { $(errId).hidden = ok; el.setAttribute("aria-invalid", !ok); if (!ok && !first) first = el; });
  const out = $("formResult");
  if (first) { out.hidden = true; first.focus(); return; }
  const topic = document.querySelector('input[name="topic"]:checked').value;
  const btn = e.submitter || $("contactForm").querySelector('[type="submit"]');

  if (isConfigured) {
    btn.disabled = true;
    const { error } = await supabase.from("messages").insert({ name: name.value.trim(), email: email.value.trim(), topic, message: msg.value.trim() });
    btn.disabled = false;
    out.hidden = false;
    if (error) { out.className = "result error"; out.textContent = friendlyError(error); return; }
    out.className = "result";
    out.innerHTML = `<b>Message sent. Thanks, ${esc(name.value.trim())}!</b> We'll reply to ${esc(email.value.trim())} as soon as we can.`;
    $("contactForm").querySelectorAll("input:not([type=radio]),textarea").forEach(el => (el.value = ""));
    return;
  }
  out.hidden = false; out.className = "result";
  out.innerHTML = `<b>Thanks, ${esc(name.value.trim())}!</b> Your ${esc(topic.toLowerCase())} is written and ready, but this form isn't connected to an inbox yet, so it hasn't been sent.
    <div class="form-actions"><button type="button" class="btn btn-primary btn-small" id="copyMsg">Copy my message</button></div>`;
});
$("formResult").addEventListener("click", e => {
  if (e.target.id === "copyMsg") copyText($("f-msg").value, "Message copied.");
});

/* =====================================================================
   ROUTING  (#home, #shop, #shop-<category>, #checkout, #order-placed, #track, #styleguide)
   ===================================================================== */
const HOME_ANCHORS = ["home", "collections", "featured", "soon", "about", "contact", "follow"];
const PAGES = ["checkout", "order-placed", "track", "styleguide"];
const views = document.querySelectorAll("[data-view]");
let currentView = "home";
function show(view) { currentView = view; views.forEach(v => (v.hidden = v.dataset.view !== view)); }
function setCurrent(token) {
  document.querySelectorAll("[data-nav]").forEach(a => a.dataset.nav === token ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
}
function route() {
  const h = (location.hash || "#home").slice(1) || "home";
  closeMenu();
  if (PAGES.includes(h)) {
    show(h); setCurrent(h); scrollTo(0, 0);
    if (h === "checkout") renderCheckout();
    if (h === "order-placed") renderPlaced();
    return;
  }
  if (h === "shop" || h.startsWith("shop-")) {
    const id = h === "shop" ? "all" : h.slice(5);
    activeCat = CATEGORIES.some(c => c.id === id) ? id : "all";
    show("shop"); renderShop(); setCurrent(h); scrollTo(0, 0); return;
  }
  show("home");
  setCurrent(HOME_ANCHORS.includes(h) ? h : "home");
  const target = h === "home" ? null : document.getElementById(h);
  requestAnimationFrame(() => (target ? target.scrollIntoView() : scrollTo(0, 0)));
}
addEventListener("hashchange", route);

/* ---------- mobile menu ---------- */
const menuBtn = $("menuBtn"), navLinks = $("navLinks");
function closeMenu() { navLinks.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false"); menuBtn.setAttribute("aria-label", "Open menu"); }
menuBtn.addEventListener("click", () => {
  const open = navLinks.classList.toggle("open");
  menuBtn.setAttribute("aria-expanded", open); menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
});
addEventListener("keydown", e => { if (e.key === "Escape") closeMenu(); });
navLinks.addEventListener("click", e => { if (e.target.closest("a")) closeMenu(); });

/* ---------- theme toggle ---------- */
const themeBtn = $("themeBtn");
const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const isDark = () => document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
function paintThemeBtn() { const d = isDark(); themeBtn.innerHTML = d ? SUN : MOON; themeBtn.setAttribute("aria-label", d ? "Switch to light mode" : "Switch to dark mode"); }
const savedTheme = store.get("cc-theme", null); if (savedTheme) document.documentElement.dataset.theme = savedTheme;
paintThemeBtn();
themeBtn.addEventListener("click", () => { const next = isDark() ? "light" : "dark"; document.documentElement.dataset.theme = next; store.set("cc-theme", next); paintThemeBtn(); });

/* ---------- back to top ---------- */
const toTop = $("toTop");
addEventListener("scroll", () => toTop.classList.toggle("hide", scrollY < 700), { passive: true });
toTop.addEventListener("click", () => scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));

/* =====================================================================
   BOOT
   ===================================================================== */
function renderAll() {
  renderHome();
  renderCart();
  if (currentView === "shop") renderShop();
}
renderStyleguide();
renderAll();
route();
loadCatalog().then(() => { renderAll(); if (currentView === "shop") renderShop(); });

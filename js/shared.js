/* Built-in illustrations used when a product has no photo yet, plus small icons. */
export const ART = {
  stickers:`<svg viewBox="0 0 200 160"><rect class="i-card" x="34" y="14" width="132" height="132" rx="12"/>
    <circle class="i-blue s-cut" cx="74" cy="56" r="22"/><path class="i-peach s-cut" d="M128 44c-7-10-23-4-20 7 2 9 20 19 20 19s18-10 20-19c3-11-13-17-20-7z"/>
    <path class="i-sage s-cut" d="M74 92l6 13 14 2-10 10 3 14-13-7-13 7 3-14-10-10 14-2z"/><rect class="i-blues s-cut" x="108" y="94" width="38" height="34" rx="9"/>
    <circle class="i-card" cx="68" cy="52" r="5"/><path class="s-ink" d="M118 108h18M118 116h12"/></svg>`,
  print:`<svg viewBox="0 0 200 160"><rect class="i-card" x="44" y="10" width="112" height="140" rx="6"/><rect class="i-blues" x="56" y="22" width="88" height="96" rx="3"/>
    <circle class="i-peach" cx="118" cy="50" r="12"/><path class="i-sage" d="M56 118V92c14-14 26-14 40 0 10-10 24-16 48-4v30z"/><path class="i-blue" d="M56 118v-12c20-10 50-12 88 0v12z" opacity=".75"/>
    <path class="s-line" d="M72 134h56"/></svg>`,
  notebook:`<svg viewBox="0 0 200 160"><rect class="i-sage" x="52" y="12" width="104" height="136" rx="10"/><rect class="i-card" x="62" y="12" width="94" height="136" rx="8"/>
    <g class="i-ink">${[30,50,70,90,110,130].map(y=>`<circle cx="62" cy="${y}" r="4"/>`).join("")}</g>
    <path class="s-line" d="M78 50h62M78 66h62M78 82h62M78 98h44M78 114h54"/><path class="i-peach" d="M126 28c-4-6-14-2-12 4 1 5 12 11 12 11s11-6 12-11c2-6-8-10-12-4z"/></svg>`,
  tag:`<svg viewBox="0 0 200 160"><path class="s-ink" d="M66 40c-20-30 10-36 20-14"/><path class="i-card s-cut" d="M70 40l70-0 20 20v66a10 10 0 0 1-10 10H70a10 10 0 0 1-10-10V50a10 10 0 0 1 10-10z" transform="rotate(-8 110 88)"/>
    <g transform="rotate(-8 110 88)"><circle class="i-paper" cx="82" cy="58" r="7"/><rect class="i-blues" x="74" y="76" width="72" height="26" rx="13"/><path class="s-ink" d="M86 89h48"/><path class="s-line" d="M78 116h40"/>
    <path class="i-peach" d="M136 116c-3-5-11-2-10 3 1 4 10 9 10 9s9-5 10-9c1-5-7-8-10-3z"/></g></svg>`,
  gift:`<svg viewBox="0 0 200 160"><rect class="i-peachs s-cut" x="50" y="64" width="100" height="80" rx="8"/><rect class="i-peach" x="44" y="50" width="112" height="24" rx="6"/>
    <rect class="i-blue" x="92" y="50" width="16" height="94"/><path class="s-ink" style="stroke:var(--blue);stroke-width:7" d="M100 50c-10-22-36-18-28-4 6 8 28 4 28 4zM100 50c10-22 36-18 28-4-6 8-28 4-28 4z"/></svg>`,
  bookmark:`<svg viewBox="0 0 200 160"><path class="i-blue s-cut" d="M84 10h40v120l-20-16-20 16z"/><circle class="i-card" cx="104" cy="44" r="10"/><path class="i-sage" d="M88 92c8-12 22-12 32 0v12H88z"/>
    <path class="s-ink" d="M104 130v18"/><path class="i-peach" d="M98 146h12l-2 8h-8z"/></svg>`,
  desk:`<svg viewBox="0 0 200 200"><rect class="i-card" x="30" y="40" width="96" height="124" rx="6" transform="rotate(-6 78 102)"/>
    <path class="s-line" d="M52 70h50M50 86h52M48 102h40" transform="rotate(-6 78 102)"/>
    <circle class="i-peach s-cut" cx="140" cy="62" r="20"/><path class="i-sage s-cut" d="M150 112l5 11 12 2-9 8 2 12-10-6-11 6 3-12-9-8 12-2z"/>
    <rect class="i-ink" x="96" y="150" width="78" height="9" rx="4" transform="rotate(-24 135 154)"/><path class="i-peach" d="M170 136l10-4-4 10z"/></svg>`
};

export const ART_KEYS = Object.keys(ART);

export const SOC_ICON = {
  f:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M14.5 8H13a2 2 0 0 0-2 2v11M9 13h5"/></svg>',
  ig:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r=".8" fill="currentColor"/></svg>',
  tt:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M13 4v11a3.5 3.5 0 1 1-3.5-3.5"/><path d="M13 4c.5 2.5 2.5 4 5 4"/></svg>',
  p:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M11 8.5h2a2.5 2.5 0 0 1 0 5h-2M11 8.5V20"/></svg>'
};

export const STATUS_LABEL = { "available":"Available", "new":"New", "coming-soon":"Coming Soon", "sold-out":"Sold Out" };

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

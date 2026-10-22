"use client";

/**
 * Business switcher with a map hero, tomorrow & leave panel, and the Employment Act footer.
 * Switching uses the View Transitions API where the browser supports it, so the whole page morphs
 * between businesses instead of jumping.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { LiveAction } from "../actions.ts";
import { BUSINESSES, businessById, type Industry } from "../businesses.ts";
import { fmtHour, fmtWindow } from "../scenario.ts";
import type { LiveState, Notice, Slot } from "../types.ts";
import { Books, Bot, Bread, CalendarCheck, Check, Coffee, Copy, Expand, ExternalLink, FirstAid, Gavel, ImageIcon, LinkIcon, MapPin, MoonStars, Navigation, Scissors, Truck, X } from "./icons.tsx";
import { LeaveForm } from "./leave.tsx";
import { clock } from "./use-live.ts";

type Act = (a: LiveAction) => Promise<{ ok: boolean; error?: string }>;

const ICON: Record<Industry, (p: { className?: string }) => ReactNode> = { Café: Coffee, Bakery: Bread, Salon: Scissors, Clinic: FirstAid, Retail: Books, Warehouse: Truck };
export const PDF_URL = "/employment-act-summary.pdf";
const SITE = "https://continuityos.davidwong51423.workers.dev";

export function switchBusiness(act: Act, id: string) {
  const run = () => act({ action: "business", id });
  type VT = { ready: Promise<void>; finished: Promise<void>; updateCallbackDone: Promise<void> };
  const doc = document as Document & { startViewTransition?: (cb: () => Promise<void>) => VT };
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!doc.startViewTransition || reduce || document.visibilityState !== "visible") return void run();
  const t = doc.startViewTransition(async () => {
    await run();
    await new Promise((r) => setTimeout(r, 80));
  });
  // a skipped transition (tab hidden, another one started) is fine: the switch itself still happens
  for (const p of [t.ready, t.finished, t.updateCallbackDone]) p?.catch(() => undefined);
}

// ───────────────────────────────── map hero + switcher

export function MapHero({ state, act, mapsKey }: { state: LiveState; act: Act; mapsKey?: string }) {
  const biz = businessById(state.businessId);
  const [loaded, setLoaded] = useState(false);
  const [photoOk, setPhotoOk] = useState(false);
  const [big, setBig] = useState(false);
  const { lat, lng } = biz.coords;
  const src = mapsKey
    ? `https://www.google.com/maps/embed/v1/view?key=${encodeURIComponent(mapsKey)}&center=${lat},${lng}&zoom=16&maptype=roadmap`
    : `https://maps.google.com/maps?q=${lat},${lng}&z=16&output=embed`;
  useEffect(() => setLoaded(false), [src]);
  useEffect(() => setPhotoOk(false), [biz.photo]);
  const Icon = ICON[biz.industry];
  const staffed = state.slots.filter((s) => s.assignments.length).length;
  return (
    <section aria-label="Business" className="lv-map relative overflow-hidden rounded-2xl border-[1.5px] border-foreground bg-[#e9dfcf] shadow-[4px_4px_0_0_#111]">
      {/* layer 1: the map of the area */}
      <div className="map-placeholder absolute inset-0" aria-hidden />
      <iframe
        key={src}
        title={`Map of ${biz.outlet}`}
        src={src}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        tabIndex={-1}
        onLoad={() => setLoaded(true)}
        className={`map-frame pointer-events-none absolute inset-0 h-[calc(100%+140px)] w-full -translate-y-[70px] border-0 transition-opacity duration-700 ${loaded ? "opacity-100" : "opacity-0"}`}
      />
      {/* layer 2: a photo of the shop, fading into the map */}
      <img
        key={biz.photo}
        src={biz.photo}
        alt=""
        aria-hidden
        onLoad={() => setPhotoOk(true)}
        className={`shop-photo pointer-events-none absolute object-cover transition-opacity duration-700 max-md:inset-x-0 max-md:top-0 max-md:h-56 max-md:w-full md:inset-y-0 md:right-0 md:h-full md:w-[52%] ${photoOk ? "opacity-100" : "opacity-0"}`}
      />
      {/* layer 3: paper wash so the text stays readable */}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,#fbf8f2_0%,rgb(251_248_242/0.92)_30%,rgb(251_248_242/0.2)_50%,transparent_62%)] max-md:bg-[linear-gradient(180deg,transparent_0%,rgb(251_248_242/0.35)_28%,rgb(251_248_242/0.94)_48%,#fbf8f2_100%)]" aria-hidden />
      <div className="relative flex min-h-[23rem] flex-col justify-end p-5 max-md:pt-44 md:p-7">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
          <span className="inline-flex items-center gap-1 rounded-full border-[1.5px] border-foreground bg-[#fde3d8] px-2 py-0.5 text-[#c8431c]">
            <Icon className="size-3.5" /> {biz.industry}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border-[1.5px] border-foreground bg-background px-2 py-0.5">
            <MapPin className="size-3.5" /> {biz.outlet}, Singapore
          </span>
        </div>
        <h2 key={biz.id} className="font-display lv-pop mt-2 max-w-xl text-4xl leading-[1.05] font-bold md:text-5xl">
          {biz.name}
        </h2>
        <p className="mt-2 max-w-md text-xs leading-5 text-muted-foreground">
          {biz.address} · {staffed}/{state.slots.length} shifts staffed · {state.crew.length} staff · lead shifts need {biz.certNeed}
        </p>
        <div className="mt-5">
          <p className="mb-1.5 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Switch business (fictional demos)</p>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pt-0.5 pb-2">
            {BUSINESSES.map((b) => {
              const I = ICON[b.industry];
              const on = b.id === biz.id;
              return (
                <button
                  key={b.id}
                  onClick={() => !on && switchBusiness(act, b.id)}
                  aria-pressed={on}
                  className={`flex min-w-[10.5rem] shrink-0 items-center gap-2 rounded-xl border-[1.5px] border-foreground px-2.5 py-2 text-left shadow-[2px_2px_0_0_#111] backdrop-blur-sm transition-all hover:-translate-y-px active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${on ? "bg-foreground text-background" : "bg-background/90"}`}
                >
                  <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg border-[1.5px] ${on ? "border-background bg-[#c8431c] text-white" : "border-foreground bg-[#fde3d8] text-[#c8431c]"}`}>
                    <I className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-bold">{b.name}</span>
                    <span className={`block text-[10px] ${on ? "opacity-70" : "text-muted-foreground"}`}>
                      {b.industry} · {b.outlet}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="absolute right-3 bottom-3 flex items-center gap-2">
        <span className="rounded bg-background/80 px-1.5 py-0.5 text-[9px] text-muted-foreground max-sm:hidden">Photo: Unsplash · Map: Google</span>
        <button
          onClick={() => setBig(true)}
          aria-label={`Enlarge photo and map of ${biz.name}`}
          title="Enlarge photo and map"
          className="flex size-9 items-center justify-center rounded-lg border-[1.5px] border-foreground bg-background/95 shadow-[2px_2px_0_0_#111] transition-all hover:-translate-y-px active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          <Expand className="size-4" />
        </button>
      </div>
      <PlaceViewer open={big} onClose={() => setBig(false)} name={biz.name} address={biz.address} area={biz.outlet} photo={biz.photo} lat={lat} lng={lng} mapsKey={mapsKey} />
    </section>
  );
}

/** Full-screen view of the shop photo and an interactive map, like opening a place in Google Maps. */
function PlaceViewer({ open, onClose, name, address, area, photo, lat, lng, mapsKey }: { open: boolean; onClose: () => void; name: string; address: string; area: string; photo: string; lat: number; lng: number; mapsKey?: string }) {
  const [tab, setTab] = useState<"both" | "photo" | "map">("both");
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", k);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  const map = mapsKey
    ? `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(mapsKey)}&q=${lat},${lng}&zoom=17`
    : `https://maps.google.com/maps?q=${lat},${lng}&z=17&output=embed`;
  const bigPhoto = photo.replace(/w=\d+/, "w=2000");
  const showPhoto = tab !== "map";
  const showMap = tab !== "photo";
  return createPortal(
    <div className="beach fixed inset-0 z-50 flex items-center justify-center bg-[#111]/60 p-3 text-foreground backdrop-blur-[2px] sm:p-6" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`${name}: photo and map`} className="lv-pop flex h-full max-h-[52rem] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border-[1.5px] border-foreground bg-background shadow-[6px_6px_0_0_#111]" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-[1.5px] border-foreground px-4 py-3">
          <div className="min-w-0">
            <p className="font-display truncate text-xl font-bold">{name}</p>
            <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" /> {area}, Singapore · demo location
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border-[1.5px] border-foreground text-[11px] font-semibold">
              {(["both", "photo", "map"] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} aria-pressed={tab === t} className={`px-2.5 py-1.5 capitalize ${tab === t ? "bg-foreground text-background" : "bg-background"}`}>
                  {t === "both" ? "Both" : t === "photo" ? "Photo" : "Map"}
                </button>
              ))}
            </div>
            <button onClick={onClose} aria-label="Close" className="rounded-full border-[1.5px] border-foreground p-1.5">
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className={`grid min-h-0 flex-1 ${showPhoto && showMap ? "grid-rows-2 md:grid-cols-2 md:grid-rows-1" : "grid-cols-1"}`}>
          {showPhoto && (
            <div className="relative min-h-0 bg-[#111]">
              <img src={bigPhoto} alt={`A shop like ${name}`} className="h-full w-full object-cover" />
              <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded bg-background/85 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                <ImageIcon className="size-3" /> Stock photo (Unsplash), not the actual shop
              </span>
            </div>
          )}
          {showMap && (
            <div className="relative min-h-0 border-foreground max-md:border-t-[1.5px] md:border-l-[1.5px]">
              <iframe title={`Map of ${area}`} src={map} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen className="absolute inset-0 h-full w-full border-0" />
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t-[1.5px] border-foreground px-4 py-3 text-xs">
          <span className="text-muted-foreground">{address}. The business is fictional; the map shows the real area.</span>
          <div className="flex flex-wrap gap-2">
            <a href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`} target="_blank" rel="noopener" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border-[1.5px] border-foreground bg-background px-3 font-semibold shadow-[2px_2px_0_0_#111]">
              <ExternalLink className="size-3.5" /> Open in Google Maps
            </a>
            <a href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`} target="_blank" rel="noopener" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border-[1.5px] border-foreground bg-[#1f5f5b] px-3 font-semibold text-white shadow-[2px_2px_0_0_#111]">
              <Navigation className="size-3.5" /> Directions
            </a>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ───────────────────────────────── tomorrow & leave

const VIA: Record<Notice["via"], string> = { leave_link: "leave link", chat: "said so in chat", checkin: "evening check-in" };

export function TomorrowCard({ state, act, onOpenLeave }: { state: LiveState; act: Act; onOpenLeave: () => void }) {
  const name = (id: string) => state.crew.find((c) => c.id === id)?.name ?? id;
  const span = 16;
  const pct = (h: number) => `${((h - 7) / span) * 100}%`;
  const w = (x: { start: number; end: number }) => `${((x.end - x.start) / span) * 100}%`;
  const asked = state.crew.filter((c) => c.checkin === "asked").length;
  const ok = state.crew.filter((c) => c.checkin === "ok").length;
  const out = state.notices.filter((n) => n.day === "tomorrow").length;
  const local = state.mode === "rehearsal";
  const link = typeof window === "undefined" ? "" : local ? `${window.location.origin}${window.location.pathname}#leave` : `${window.location.origin}/live/leave`;
  const [copied, setCopied] = useState(false);
  return (
    <section id="tomorrow" style={{ "--d": "140ms" } as CSSProperties} className="lv-rise scroll-mt-24 rounded-2xl border-[1.5px] border-foreground bg-background shadow-[4px_4px_0_0_#111]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-[1.5px] border-foreground px-5 py-4">
        <div className="min-w-0">
          <h2 className="font-display flex items-center gap-2 text-lg font-semibold">
            <span className="flex size-7 items-center justify-center rounded-lg border-[1.5px] border-foreground bg-[#fde3d8] text-[#c8431c]">
              <CalendarCheck className="size-4" />
            </span>
            Tomorrow &amp; leave
          </h2>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">Staff tell the agent early through the leave link, the chat or the evening check-in. It finds cover the day before, so the gap never reaches the door.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => act({ action: "checkin_tomorrow" })} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border-[1.5px] border-foreground bg-[#1f5f5b] px-3 text-xs font-semibold text-white shadow-[2px_2px_0_0_#111] transition-all hover:-translate-y-px active:translate-x-[2px] active:translate-y-[2px] active:shadow-none">
            <MoonStars className="size-3.5" />
            Run evening check-in
          </button>
          <button onClick={onOpenLeave} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border-[1.5px] border-foreground bg-background px-3 text-xs font-semibold shadow-[2px_2px_0_0_#111] transition-all hover:-translate-y-px active:translate-x-[2px] active:translate-y-[2px] active:shadow-none">
            <LinkIcon className="size-3.5" />
            Open leave link
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 space-y-4">
          <div className="overflow-x-auto">
            <div className="min-w-[34rem] space-y-1.5">
              <div className="relative ml-28 h-4 font-mono text-[9px] text-muted-foreground">
                {[7, 11, 15, 19, 23].map((h, i, a) => (
                  <span key={h} className="absolute" style={{ left: pct(h), transform: i === 0 ? "none" : i === a.length - 1 ? "translateX(-100%)" : "translateX(-50%)" }}>
                    {fmtHour(h)}
                  </span>
                ))}
              </div>
              {state.tomorrow.map((sl: Slot) => (
                <div key={sl.id} className="flex items-center gap-2">
                  <span className="w-26 shrink-0 truncate text-[11px] font-semibold">{sl.role}</span>
                  <div className="relative h-8 flex-1 rounded-lg border-[1.5px] border-foreground/15 bg-[#f4efe6]/60">
                    {sl.assignments.length === 0 && (
                      <span className="lv-blink absolute inset-y-0.5 flex items-center rounded-md border-[1.5px] border-dashed border-foreground bg-[repeating-linear-gradient(135deg,#d9d1c3_0_5px,#fbf8f2_5px_10px)] px-2 text-[10px] font-bold" style={{ left: pct(sl.window.start), width: w(sl.window) }}>
                        Finding cover…
                      </span>
                    )}
                    {sl.assignments.map((a) => (
                      <span key={a.crewId} className={`absolute inset-y-0.5 flex items-center gap-1 overflow-hidden rounded-md border-[1.5px] border-foreground px-2 text-[10px] font-semibold whitespace-nowrap ${a.source === "ai" ? "lv-grow bg-[#1f5f5b] text-white" : "bg-background"}`} style={{ left: pct(a.window.start), width: w(a.window) }}>
                        {a.source === "ai" && <Bot className="size-3 shrink-0" />}
                        {name(a.crewId)} <span className="font-normal opacity-70">{fmtWindow(a.window)}</span>
                        {state.crew.find((c) => c.id === a.crewId)?.checkin === "ok" && <Check className="size-3 shrink-0" aria-label="confirmed" />}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Early notices</p>
            {state.notices.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">None yet. Try the evening check-in, the leave link, or text &ldquo;can&apos;t make it tmr&rdquo; as someone in Staff chat.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {[...state.notices].reverse().map((n) => {
                  const sl = state.tomorrow.find((x) => x.id === n.slotId) ?? state.slots.find((x) => x.id === n.slotId);
                  return (
                    <li key={n.id} className="lv-pop flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border-[1.5px] border-foreground/20 p-2.5 text-xs">
                      <span className="font-semibold">{name(n.crewId)}</span>
                      <span className="text-muted-foreground">
                        can&apos;t make {n.day === "later" ? n.label : n.day}&apos;s {sl?.role.toLowerCase()} {sl ? fmtWindow(sl.window) : ""} · {VIA[n.via]} · {clock(n.at).slice(0, 5)}
                      </span>
                      <span
                        className={`ml-auto inline-flex items-center gap-1 rounded-full border-[1.5px] px-2 py-0.5 text-[11px] font-medium ${n.status === "covered" ? "border-[#1f5f5b] bg-[#1f5f5b] text-white" : n.status === "no_cover" ? "border-foreground bg-[#fde3d8] text-[#c8431c]" : "border-dashed border-[#1f5f5b] text-[#1f5f5b]"}`}
                      >
                        {n.status === "covered" ? `Covered by ${name(n.coverId!)}` : n.status === "no_cover" ? "Nobody free: manager told" : `Finding cover · asked ${n.asked.length}`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
        <div className="space-y-3">
          <div className="rounded-xl border-[1.5px] border-foreground bg-[#f4efe6] p-3">
            <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Evening check-in</p>
            <p className="mt-1 text-xs">{state.checkinAt ? `Sent at ${clock(state.checkinAt).slice(0, 5)}` : "Runs at 20:00 every evening"}</p>
            <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
              {[
                [ok, "confirmed"],
                [asked, "waiting"],
                [out, "can't make it"],
              ].map(([v, l]) => (
                <div key={l as string} className="rounded-lg border-[1.5px] border-foreground bg-background p-1.5">
                  <p className="font-display text-lg font-bold">{v}</p>
                  <p className="text-[9.5px] leading-3 text-muted-foreground">{l}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border-[1.5px] border-foreground p-3">
            <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Leave link for staff</p>
            <p className="mt-1 truncate font-mono text-[10px]" title={link}>
              {link || "…"}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => {
                  void navigator.clipboard?.writeText(link).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  });
                }}
                className="inline-flex min-h-8 items-center gap-1 rounded-lg border-[1.5px] border-foreground bg-background px-2 text-[11px] font-semibold"
              >
                {copied ? <Check className="size-3" /> : <Copy className="size-3" />} {copied ? "Copied" : "Copy"}
              </button>
              <button onClick={onOpenLeave} className="inline-flex min-h-8 items-center gap-1 rounded-lg border-[1.5px] border-foreground bg-background px-2 text-[11px] font-semibold">
                <ExternalLink className="size-3" /> Open
              </button>
            </div>
            <p className="mt-2 text-[10px] leading-4 text-muted-foreground">Also in every staff chat: telling the bot &ldquo;can&apos;t make it tmr&rdquo;, or sending /leave, does the same.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function LeaveModal({ open, onClose, state, act }: { open: boolean; onClose: () => void; state: LiveState; act: Act }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  const biz = businessById(state.businessId);
  return createPortal(
    <div className="beach fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#111]/40 p-4 pt-[8vh] text-foreground backdrop-blur-[2px]" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Leave link" className="lv-pop w-full max-w-md rounded-2xl border-[1.5px] border-foreground bg-background p-6 shadow-[6px_6px_0_0_#111]" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">What staff see on the leave link</p>
            <p className="font-display mt-1 text-xl font-bold">Can&apos;t make a shift?</p>
            <p className="text-xs text-muted-foreground">
              {biz.name} · {biz.outlet}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full border-[1.5px] border-foreground p-1.5">
            <X className="size-3.5" />
          </button>
        </div>
        <LeaveForm state={state} act={act} />
      </div>
    </div>,
    document.body,
  );
}

// ───────────────────────────────── Employment Act shortcut (footer)

export function EmploymentActFooter() {
  const local = !!(globalThis as { __lvNoDownload?: boolean }).__lvNoDownload;
  const pdf = local ? `${SITE}${PDF_URL}` : PDF_URL;
  const rules = [
    "Up to 44 normal hours a week; never more than 12 hours in a day",
    "Overtime: at most 72 hours a month, paid at least 1.5×",
    "No more than 6 hours in a row without a break",
    "1 rest day a week (shift workers: a continuous 30 hours)",
    "Sick leave after 3 months: up to 14 days outpatient, 60 days hospitalisation; staff must tell you within 48 hours",
    "Annual leave: 7 days in year 1, rising by 1 a year to 14",
    "Part-time staff: leave pro-rated by hours",
  ];
  return (
    <footer id="employment-act" className="scroll-mt-24 rounded-2xl border-[1.5px] border-dashed border-foreground/60 bg-[#fbf8f2]/70 p-4 text-[11px] leading-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-semibold">
          <span className="flex size-5 items-center justify-center rounded-md border border-foreground bg-[#fde3d8] text-[#c8431c]">
            <Gavel className="size-3" />
          </span>
          Employment Act shortcuts (Singapore)
        </p>
        <div className="flex flex-wrap gap-3">
          <a href={pdf} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-semibold underline underline-offset-2">
            Full rules (PDF) <ExternalLink className="size-3" />
          </a>
          <a href="https://www.mom.gov.sg/employment-practices/hours-of-work-overtime-and-rest-days" target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-muted-foreground underline underline-offset-2">
            MOM guidance <ExternalLink className="size-3" />
          </a>
        </div>
      </div>
      <ul className="mt-2 grid gap-x-6 gap-y-1 text-muted-foreground sm:grid-cols-2">
        {rules.map((r) => (
          <li key={r} className="flex gap-1.5">
            <span className="mt-[5px] size-1 shrink-0 rounded-full bg-[#c8431c]" />
            {r}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Hours and overtime rules apply to staff covered by Part IV (workmen earning up to S$4,500 or other staff up to S$2,600 basic a month). The agent already enforces weekly hour caps, rest between shifts and one shift a day. A summary for convenience, not legal advice.
      </p>
    </footer>
  );
}

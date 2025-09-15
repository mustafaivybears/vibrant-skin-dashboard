import React, { useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid
} from "recharts";
import { Layers, TrendingUp, DollarSign, CalendarClock, Trash2 } from "lucide-react";
import { createClient } from "@supabase/supabase-js";

/* ---------- Numbers & Currency (de-DE) ---------- */
const nf = new Intl.NumberFormat("de-DE"); // 60.000
const tf = new Intl.NumberFormat("de-DE", {
  style: "currency", currency: "TRY", maximumFractionDigits: 0,
});
const fmt = (v?: number) => nf.format(v ?? 0);
const fmtTL = (v?: number) => tf.format(v ?? 0);

/* ---------- Supabase (opsiyonel) ---------- */
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  || (window as any).VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON || (window as any).VITE_SUPABASE_ANON;
const supabase = (SUPABASE_URL && SUPABASE_ANON) ? createClient(SUPABASE_URL, SUPABASE_ANON) : null;

/* ---------- UI helpers ---------- */
const Card = ({ className = "", children }: { className?: string; children: any }) => (
  <div className={`card ${className}`}>{children}</div>
);

const CHANNELS = ["Trendyol", "Hepsiburada"] as const;
type Channel = (typeof CHANNELS)[number];
type ChannelDatum = { revenue: number; spend: number; units: number };
type Period = { id: string; label: string; kind: "Monthly" | "Weekly"; data: Record<Channel, ChannelDatum> };
type DailyEntry = { id: string; date: string; channel: Channel; revenue: number; spend: number; units: number };

const seedData: Period[] = [
  { id: "2025-06", label: "2025-06", kind: "Monthly",
    data: { Trendyol: { revenue: 31755, spend: 2000, units: 121 }, Hepsiburada: { revenue: 21510, spend: 1000, units: 66 } } },
  { id: "2025-07", label: "2025-07", kind: "Monthly",
    data: { Trendyol: { revenue: 35718, spend: 2200, units: 115 }, Hepsiburada: { revenue: 24583, spend: 1100, units: 68 } } },
  { id: "2025-08", label: "2025-08", kind: "Monthly",
    data: { Trendyol: { revenue: 50162, spend: 4386, units: 199 }, Hepsiburada: { revenue: 27457, spend: 1186, units: 93 } } },
  { id: "2025-09", label: "2025-09 (to date)", kind: "Monthly",
    data: { Trendyol: { revenue: 26482, spend: 2788, units: 73 }, Hepsiburada: { revenue: 13660, spend: 345, units: 43 } } },
];

export default function Dashboard() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [mode, setMode] = useState<"Monthly" | "Weekly">("Weekly");
  const [dailyEntries, setDailyEntries] = useState<DailyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const backend: "supabase" | "local" = supabase ? "supabase" : "local";

  /* Günlük giriş alanları */
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const [dailyDate, setDailyDate] = useState<string>(`${yyyy}-${mm}-${dd}`);
  const [dailyChannel, setDailyChannel] = useState<Channel>("Trendyol");
  const [dailyRevenue, setDailyRevenue] = useState<number>(0);
  const [dailySpend, setDailySpend] = useState<number>(0);
  const [dailyUnits, setDailyUnits] = useState<number>(0);

  function isoWeek(d: Date) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return { year: date.getUTCFullYear(), week: weekNo };
  }

  /* ---------- Load ---------- */
  async function loadAll() {
    setLoading(true);
    try {
      if (supabase) {
        const { data: pRows } = await supabase.from("periods").select("*").order("id");
        const { data: dRows } = await supabase.from("daily_entries").select("*").order("date");
        const p: Period[] = (pRows || []).map((r: any) => ({ id: r.id, label: r.label, kind: r.kind, data: r.data }));
        const d: DailyEntry[] = (dRows || []).map((r: any) => ({
          id: r.id, date: r.date, channel: r.channel,
          revenue: Number(r.revenue), spend: Number(r.spend), units: Number(r.units),
        }));
        setPeriods(p.length ? p : seedData);
        setDailyEntries(d);
      } else {
        const lp = localStorage.getItem("vs_dashboard_periods");
        const ld = localStorage.getItem("vs_dashboard_daily");
        setPeriods(lp ? JSON.parse(lp) : seedData);
        setDailyEntries(ld ? JSON.parse(ld) : []);
      }
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { loadAll(); }, []);
  useEffect(() => {
    if (!supabase) {
      localStorage.setItem("vs_dashboard_periods", JSON.stringify(periods));
      localStorage.setItem("vs_dashboard_daily", JSON.stringify(dailyEntries));
    }
  }, [periods, dailyEntries]);

  async function persistPeriod(p: Period) {
    if (supabase) await supabase.from("periods").upsert({ id: p.id, label: p.label, kind: p.kind, data: p.data });
  }
  async function persistDaily(e: DailyEntry, op: "insert" | "delete") {
    if (!supabase) return;
    if (op === "insert") await supabase.from("daily_entries").insert(e);
    else await supabase.from("daily_entries").delete().eq("id", e.id);
  }

  function upsertDelta(
    kind: "Monthly" | "Weekly", id: string, label: string, ch: Channel,
    rev: number, sp: number, un: number, sign: 1 | -1 = 1
  ) {
    setPeriods(prev => {
      const next = [...prev];
      let i = next.findIndex(p => p.id === id && p.kind === kind);
      if (i < 0) {
        next.push({
          id, label, kind,
          data: { Trendyol: { revenue: 0, spend: 0, units: 0 }, Hepsiburada: { revenue: 0, spend: 0, units: 0 } },
        });
        i = next.length - 1;
      }
      const cur = next[i].data[ch];
      next[i].data[ch] = {
        revenue: (cur.revenue || 0) + rev * sign,
        spend: (cur.spend || 0) + sp * sign,
        units: (cur.units || 0) + un * sign,
      };
      persistPeriod(next[i]);
      return next;
    });
  }

  function addDaily() {
    if (!dailyDate) return;
    const d = new Date(dailyDate + "T00:00:00");
    const monthId = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const iw = isoWeek(d);
    const weekId = `${iw.year}-W${String(iw.week).padStart(2, "0")}`;
    upsertDelta("Monthly", monthId, monthId, dailyChannel, dailyRevenue, dailySpend, dailyUnits, 1);
    upsertDelta("Weekly", weekId, `${iw.year} W${String(iw.week).padStart(2, "0")}`, dailyChannel, dailyRevenue, dailySpend, dailyUnits, 1);
    const entry: DailyEntry = {
      id: `${dailyDate}-${dailyChannel}-${Date.now()}`, date: dailyDate, channel: dailyChannel,
      revenue: dailyRevenue, spend: dailySpend, units: dailyUnits
    };
    setDailyEntries(prev => { const next = [...prev, entry]; persistDaily(entry, "insert"); return next; });
    setDailyRevenue(0); setDailySpend(0); setDailyUnits(0);
  }

  function deleteDaily(entry: DailyEntry) {
    const d = new Date(entry.date + "T00:00:00");
    const monthId = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const iw = isoWeek(d);
    const weekId = `${iw.year}-W${String(iw.week).padStart(2, "0")}`;
    upsertDelta("Monthly", monthId, monthId, entry.channel, entry.revenue, entry.spend, entry.units, -1);
    upsertDelta("Weekly", weekId, `${iw.year} W${String(iw.week).padStart(2, "0")}`, entry.channel, entry.revenue, entry.spend, entry.units, -1);
    setDailyEntries(prev => { const next = prev.filter(e => e.id !== entry.id); persistDaily(entry, "delete"); return next; });
  }

  /* ---------- WEEKLY BULK IMPORT ---------- */
  function upsertWeekly(id: string, label: string, ch: Channel, rev: number, sp: number, un: number) {
    setPeriods(prev => {
      const next = [...prev];
      let i = next.findIndex(p => p.id === id && p.kind === "Weekly");
      if (i < 0) {
        next.push({
          id, label, kind: "Weekly",
          data: { Trendyol: { revenue: 0, spend: 0, units: 0 }, Hepsiburada: { revenue: 0, spend: 0, units: 0 } }
        });
        i = next.length - 1;
      }
      const cur = next[i].data[ch];
      next[i].data[ch] = {
        revenue: (cur.revenue || 0) + rev,
        spend: (cur.spend || 0) + sp,
        units: (cur.units || 0) + un,
      };
      persistPeriod(next[i]);
      return next;
    });
  }

  function importWeeklyFromText(text: string) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let ok = 0, fail = 0;
    for (const line of lines) {
      if (line.startsWith("#")) continue;
      const parts = line.split(",").map(s => s.trim());
      if (parts.length < 5) { fail++; continue; }
      const [id, chRaw, revStr, spStr, unStr] = parts;
      const ch = (chRaw === "Trendyol" || chRaw === "Hepsiburada") ? (chRaw as Channel) : null;
      const rev = Number(revStr), sp = Number(spStr), un = Number(unStr);
      if (!id || !ch || Number.isNaN(rev) || Number.isNaN(sp) || Number.isNaN(un)) { fail++; continue; }
      const label = id.replace("W", " W");
      upsertWeekly(id, label, ch, rev, sp, un);
      ok++;
    }
    alert(`Weekly import: ${ok} satır işlendi, ${fail} satır atlandı.`);
  }

  async function resetWeekly() {
    if (supabase) {
      await supabase.from("periods").delete().eq("kind", "Weekly");
    }
    setPeriods(prev => prev.filter(p => p.kind !== "Weekly"));
    alert("Weekly veriler sıfırlandı ✅");
  }

  /* ---------- Data sets ---------- */
  const filtered = useMemo(
    () => periods.filter(p => p.kind === mode).sort((a, b) => a.id.localeCompare(b.id)),
    [periods, mode]
  );

  const rows = useMemo(() => filtered.map((p, i) => {
    const prev = filtered[i - 1];
    const calc = (ch: Channel) => {
      const cur = p.data[ch]; const prv = prev?.data[ch];
      const roas = cur.spend > 0 ? cur.revenue / cur.spend : undefined;
      const prevRoas = prv && prv.spend > 0 ? prv.revenue / prv.spend : undefined;
      const pp = (a?: number, b?: number) => (a === undefined || b === undefined || b === 0) ? undefined : ((a - b) / b) * 100;
      return { roas, momRev: pp(cur?.revenue, prv?.revenue), momSpend: pp(cur?.spend, prv?.spend), momUnits: pp(cur?.units, prv?.units), momRoas: pp(roas, prevRoas) };
    };
    return { ...p, meta: { Trendyol: calc("Trendyol"), Hepsiburada: calc("Hepsiburada") } };
  }), [filtered]);

  const ts = (key: keyof ChannelDatum) => rows.map(r => ({
    period: r.label, Trendyol: r.data.Trendyol[key], Hepsiburada: r.data.Hepsiburada[key]
  }));
  const tsRevenue = useMemo(() => ts("revenue"), [rows]);
  const tsSpend   = useMemo(() => ts("spend"),   [rows]);
  const tsUnits   = useMemo(() => ts("units"),   [rows]);
  const tsROAS    = useMemo(() => rows.map(r => ({
    period: r.label,
    Trendyol: r.meta.Trendyol.roas ?? 0,
    Hepsiburada: r.meta.Hepsiburada.roas ?? 0
  })), [rows]);

  const weeklyRows = useMemo(() => periods
    .filter(p => p.kind === "Weekly")
    .sort((a, b) => a.id.localeCompare(b.id)), [periods]);

  const tsTimeline = weeklyRows.map(w => ({
    period: w.label,
    Revenue: w.data.Trendyol.revenue + w.data.Hepsiburada.revenue,
    Spend:   w.data.Trendyol.spend   + w.data.Hepsiburada.spend,
    Units:   w.data.Trendyol.units   + w.data.Hepsiburada.units,
  }));

  if (loading) return <div style={{ padding: 20 }}>Loading…</div>;

const [title, setTitle] = useState("Vibrant Skin Dashboard");

...

<div className="header">
  <h1>
    <Layers style={{ width: 20, height: 20, verticalAlign: "-3px" }} /> {title}
  </h1>
  <input
    type="text"
    value={title}
    onChange={(e) => setTitle(e.target.value)}
    style={{ marginLeft: 12, padding: "4px 8px", borderRadius: 4 }}
  />
</div>


      {/* BULK WEEKLY IMPORT (CSV) */}
      <Card>
        <div className="header"><div>Bulk Weekly Import (CSV)</div></div>
        <textarea
          id="weeklyImport"
          placeholder="2025-W31,Trendyol,12000,600,50"
          style={{ width: "100%", height: 120, marginTop: 8, padding: 8, background: "#111", color: "#fff", border: "1px solid #333", borderRadius: 4 }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button
            onClick={() => {
              const text = (document.getElementById("weeklyImport") as HTMLTextAreaElement).value;
              importWeeklyFromText(text);
            }}
            style={{ padding: "6px 12px", borderRadius: 4, background: "#333", color: "#fff" }}
          >
            Import Weekly
          </button>
          <button
            onClick={() => {
              const demo = [
                "# 2025 August split example",
                "2025-W31,Trendyol,12541,1097,50",
                "2025-W31,Hepsiburada,6865,297,24",
              ].join("\n");
              (document.getElementById("weeklyImport") as HTMLTextAreaElement).value = demo;
            }}
            style={{ padding: "6px 12px", borderRadius: 4, background: "#222", color: "#fff" }}
          >
            Load Demo
          </button>
          <button
            onClick={resetWeekly}
            style={{ padding: "6px 12px", borderRadius: 4, background: "#b91c

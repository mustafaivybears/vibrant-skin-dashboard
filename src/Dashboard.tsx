import React, { useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid
} from "recharts";
import { Layers, TrendingUp, DollarSign, CalendarClock, Trash2 } from "lucide-react";
import { createClient } from "@supabase/supabase-js";

/* ---------- Numbers & Currency (de-DE) ---------- */
const nf = new Intl.NumberFormat("de-DE"); // 60.000
const tf = new Intl.NumberFormat("de-DE", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });
const fmt = (v?: number) => nf.format(v ?? 0);
const fmtTL = (v?: number) => tf.format(v ?? 0);

/* ---------- Supabase (opsiyonel) ---------- */
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  || (window as any).VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON || (window as any).VITE_SUPABASE_ANON;
const supabase = (SUPABASE_URL && SUPABASE_ANON) ? createClient(SUPABASE_URL, SUPABASE_ANON) : null;

/* ---------- UI helpers ---------- */
const Card = ({ className = "", children }: { className?: string; children: React.ReactNode }) => (
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

  /* ---------- Flexible Title ---------- */
  const [title, setTitle] = useState<string>(() => localStorage.getItem("dashboardTitle") || "Vibrant Skin Dashboard");
  useEffect(() => { localStorage.setItem("dashboardTitle", title); }, [title]);

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
    } finally { setLoading(false); }
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
    upsertDelta("Weekly", weekId, `${iw.year} W${String(iw.week).padStart(2, "0")}`, dailyChannel, dailyRevenue, dailySpend, 1 * dailyUnits, 1);
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
    // Beklenen format: YYYY-Wxx,Channel,Revenue,Spend,Units
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

  return (
    <div style={{ padding: 24 }}>
      <div className="header">
        <h1>
          <Layers style={{ width: 20, height: 20, verticalAlign: "-3px" }} /> {title}
        </h1>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Dashboard adını yaz..."
          style={{ marginLeft: 12, padding: "4px 8px", borderRadius: 4 }}
        />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select value={mode} onChange={e => setMode(e.target.value as any)}>
            <option value="Monthly">Monthly View</option>
            <option value="Weekly">Weekly View</option>
          </select>
          <span className="small">Storage: <b>{backend}</b></span>
        </div>
      </div>

      {/* BULK WEEKLY IMPORT (CSV) */}
      <Card>
        <div className="header"><div>Bulk Weekly Import (CSV)</div></div>
        <textarea
          id="weeklyImport"
          placeholder="2025-W31,Trendyol,12000,600,50"
          style={{ width: "100%", height: 120, marginTop: 8, padding: 8, background: "#111", color: "#fff", border: "1px solid #333", borderRadius: 4 }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
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
            style={{ padding: "6px 12px", borderRadius: 4, background: "#b91c1c", color: "#fff", fontWeight: 600 }}
          >
            Reset Weekly Data
          </button>
        </div>
        <p className="small" style={{ marginTop: 6 }}>
          Format: <code>YYYY-Wxx,Channel,Revenue,Spend,Units</code> — Ör: <code>2025-W31,Trendyol,12000,600,50</code>
        </p>
      </Card>

      {/* Quick daily entry + table */}
      <Card>
        <div className="hgrid" style={{ gridTemplateColumns: "repeat(6, minmax(0,1fr))" }}>
          <div><div className="small">Date</div><input type="date" value={dailyDate} onChange={e => setDailyDate(e.target.value)} /></div>
          <div><div className="small">Channel</div>
            <select value={dailyChannel} onChange={e => setDailyChannel(e.target.value as any)}>
              <option>Trendyol</option><option>Hepsiburada</option>
            </select>
          </div>
          <div><div className="small">Revenue (TL)</div><input type="number" value={dailyRevenue} onChange={e => setDailyRevenue(parseFloat(e.target.value || "0"))} /></div>
          <div><div className="small">Spend (TL)</div><input type="number" value={dailySpend} onChange={e => setDailySpend(parseFloat(e.target.value || "0"))} /></div>
          <div><div className="small">Units</div><input type="number" value={dailyUnits} onChange={e => setDailyUnits(parseFloat(e.target.value || "0"))} /></div>
          <div style={{ display: "flex", alignItems: "end" }}><button onClick={addDaily}>Add Day</button></div>
        </div>
        <div className="small" style={{ marginTop: 6 }}>
          Günlük giriş ay ve ISO haftasına otomatik eklenir. Backend: {backend === "supabase" ? "Supabase" : "LocalStorage"}
        </div>

        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table>
            <thead><tr><th>Date</th><th>Channel</th><th>Revenue</th><th>Spend</th><th>Units</th><th>Action</th></tr></thead>
            <tbody>
              {dailyEntries.map(e => (
                <tr key={e.id}>
                  <td>{e.date}</td>
                  <td>{e.channel}</td>
                  <td>{fmtTL(e.revenue)}</td>
                  <td>{fmtTL(e.spend)}</td>
                  <td>{fmt(e.units)}</td>
                  <td><button onClick={() => deleteDaily(e)} title="Delete"><Trash2 style={{ width: 16, height: 16 }} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* KPI — TOTAL & BY CHANNEL */}
      {(() => {
        const kpiRows = filtered;
        const lastIdx = kpiRows.length - 1;
        const currP = lastIdx >= 0 ? kpiRows[lastIdx] : undefined;
        const prevP = lastIdx > 0 ? kpiRows[lastIdx - 1] : undefined;
        const sumAll = (p?: Period, key?: keyof ChannelDatum) => p && key ? (p.data.Trendyol[key] + p.data.Hepsiburada[key]) : 0;
        const dlt = (c: number, p: number) => (p ? ((c - p) / p) * 100 : undefined);
        const kpiTotal = {
          revenue: { curr: sumAll(currP, "revenue"), prev: sumAll(prevP, "revenue") },
          units:   { curr: sumAll(currP, "units"),   prev: sumAll(prevP, "units") },
          spend:   { curr: sumAll(currP, "spend"),   prev: sumAll(prevP, "spend") },
        } as const;
        const kpiTotalDelta = {
          revenue: dlt(kpiTotal.revenue.curr, kpiTotal.revenue.prev),
          units:   dlt(kpiTotal.units.curr,   kpiTotal.units.prev),
          spend:   dlt(kpiTotal.spend.curr,   kpiTotal.spend.prev),
        } as const;
        const byCh = (ch: Channel, key: keyof ChannelDatum) => ({
          curr: currP ? currP.data[ch][key] : 0,
          prev: prevP ? prevP.data[ch][key] : 0,
          delta: dlt(currP ? currP.data[ch][key] : 0, prevP ? prevP.data[ch][key] : 0)
        });
        const kpiTY = { revenue: byCh("Trendyol", "revenue"), units: byCh("Trendyol", "units"), spend: byCh("Trendyol", "spend") } as const;
        const kpiHB = { revenue: byCh("Hepsiburada", "revenue"), units: byCh("Hepsiburada", "units"), spend: byCh("Hepsiburada", "spend") } as const;
        return (
          <>
            <div className="hgrid" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))", margin: "16px 0" }}>
              <Card>
                <div className="small">Revenue (vs previous {mode === 'Monthly' ? 'month' : 'week'})</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                  <div style={{ fontSize: 28, fontWeight: 700 }}>{fmtTL(kpiTotal.revenue.curr)}</div>
                  <div className="small" style={{ color: (kpiTotalDelta.revenue ?? 0) >= 0 ? '#10b981' : '#ef4444' }}>
                    {kpiTotalDelta.revenue !== undefined ? `${kpiTotalDelta.revenue >= 0 ? '▲' : '▼'} ${kpiTotalDelta.revenue.toFixed(1)}%` : '—'}
                  </div>
                </div>
                <div className="small">Prev: {fmtTL(kpiTotal.revenue.prev)}</div>
              </Card>
              <Card>
                <div className="small">Units (vs previous {mode === 'Monthly' ? 'month' : 'week'})</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                  <div style={{ fontSize: 28, fontWeight: 700 }}>{fmt(kpiTotal.units.curr)}</div>
                  <div className="small" style={{ color: (kpiTotalDelta.units ?? 0) >= 0 ? '#10b981' : '#ef4444' }}>
                    {kpiTotalDelta.units !== undefined ? `${kpiTotalDelta.units >= 0 ? '▲' : '▼'} ${kpiTotalDelta.units.toFixed(1)}%` : '—'}
                  </div>
                </div>
                <div className="small">Prev: {fmt(kpiTotal.units.prev)}</div>
              </Card>
              <Card>
                <div className="small">Spend (vs previous {mode === 'Monthly' ? 'month' : 'week'})</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                  <div style={{ fontSize: 28, fontWeight: 700 }}>{fmtTL(kpiTotal.spend.curr)}</div>
                  <div className="small" style={{ color: (kpiTotalDelta.spend ?? 0) >= 0 ? '#10b981' : '#ef4444' }}>
                    {kpiTotalDelta.spend !== undefined ? `${kpiTotalDelta.spend >= 0 ? '▲' : '▼'} ${kpiTotalDelta.spend.toFixed(1)}%` : '—'}
                  </div>
                </div>
                <div className="small">Prev: {fmtTL(kpiTotal.spend.prev)}</div>
              </Card>
            </div>

            <div className="hgrid" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))', marginBottom: 12 }}>
              <Card>
                <div className="small">Trendyol — Revenue ({mode})</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#ff9a2f' }}>{fmtTL(kpiTY.revenue.curr)}</div>
                  <div className="small" style={{ color: (kpiTY.revenue.delta ?? 0) >= 0 ? '#10b981' : '#ef4444' }}>
                    {kpiTY.revenue.delta !== undefined ? `${kpiTY.revenue.delta >= 0 ? '▲' : '▼'} ${kpiTY.revenue.delta.toFixed(1)}%` : '—'}
                  </div>
                </div>
                <div className="small">Units: {fmt(kpiTY.units.curr)} ({kpiTY.units.delta !== undefined ? `${kpiTY.units.delta >= 0 ? '▲' : '▼'} ${kpiTY.units.delta.toFixed(1)}%` : '—'}) • Spend: {fmtTL(kpiTY.spend.curr)} ({kpiTY.spend.delta !== undefined ? `${kpiTY.spend.delta >= 0 ? '▲' : '▼'} ${kpiTY.spend.delta.toFixed(1)}%` : '—'})</div>
              </Card>
              <Card>
                <div className="small">Hepsiburada — Revenue ({mode})</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#9e88ff' }}>{fmtTL(kpiHB.revenue.curr)}</div>
                  <div className="small" style={{ color: (kpiHB.revenue.delta ?? 0) >= 0 ? '#10b981' : '#ef4444' }}>
                    {kpiHB.revenue.delta !== undefined ? `${kpiHB.revenue.delta >= 0 ? '▲' : '▼'} ${kpiHB.revenue.delta.toFixed(1)}%` : '—'}
                  </div>
                </div>
                <div className="small">Units: {fmt(kpiHB.units.curr)} ({kpiHB.units.delta !== undefined ? `${kpiHB.units.delta >= 0 ? '▲' : '▼'} ${kpiHB.units.delta.toFixed(1)}%` : '—'}) • Spend: {fmtTL(kpiHB.spend.curr)} ({kpiHB.spend.delta !== undefined ? `${kpiHB.spend.delta >= 0 ? '▲' : '▼'} ${kpiHB.spend.delta.toFixed(1)}%` : '—'})</div>
              </Card>
              <Card>
                <div className="small">Tip</div>
                <div className="small">KPI kartları seçili <b>{mode}</b> görünümüne göre güncellenir. Weekly için “önceki hafta”, Monthly için “önceki ay” baz alınır.</div>
              </Card>
            </div>
          </>
        );
      })()}

      {/* REVENUE & SPEND */}
      <div className="hgrid grid2" style={{ marginTop: 16 }}>
        <Card>
          <div className="header"><div><TrendingUp style={{ width: 18, height: 18 }} /> Revenue</div></div>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tsRevenue}>
                <defs>
                  <linearGradient id="gradTyRev" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#ff7f0e" /><stop offset="100%" stopColor="#ffb347" />
                  </linearGradient>
                  <linearGradient id="gradHbRev" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#7c62ff" /><stop offset="100%" stopColor="#b19cd9" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
                <XAxis dataKey="period" stroke="#cfd3ff" />
                <YAxis stroke="#cfd3ff" tickFormatter={(v) => nf.format(v as number)} />
                <Tooltip contentStyle={{ background: "#111", border: "1px solid #333", color: "#fff" }}
                  formatter={(val: any, name) => [fmtTL(val as number), name]} />
                <Legend />
                <Line type="monotone" dataKey="Trendyol" stroke="url(#gradTyRev)" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="Hepsiburada" stroke="url(#gradHbRev)" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <div className="header"><div><DollarSign style={{ width: 18, height: 18 }} /> Spend</div></div>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tsSpend}>
                <defs>
                  <linearGradient id="gradTySp" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#ff7f0e" /><stop offset="100%" stopColor="#ffb347" />
                  </linearGradient>
                  <linearGradient id="gradHbSp" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#7c62ff" /><stop offset="100%" stopColor="#b19cd9" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
                <XAxis dataKey="period" stroke="#cfd3ff" />
                <YAxis stroke="#cfd3ff" tickFormatter={(v) => nf.format(v as number)} />
                <Tooltip contentStyle={{ background: "#111", border: "1px solid #333", color: "#fff" }}
                  formatter={(val: any, name) => [fmtTL(val as number), name]} />
                <Legend />
                <Line type="monotone" dataKey="Trendyol" stroke="url(#gradTySp)" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="Hepsiburada" stroke="url(#gradHbSp)" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* UNITS & ROAS */}
      <div className="hgrid grid2" style={{ marginTop: 16 }}>
        <Card>
          <div className="header"><div><CalendarClock style={{ width: 18, height: 18 }} /> Units</div></div>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tsUnits}>
                <defs>
                  <linearGradient id="gradTyUn" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#ff7f0e" /><stop offset="100%" stopColor="#ffb347" />
                  </linearGradient>
                  <linearGradient id="gradHbUn" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#7c62ff" /><stop offset="100%" stopColor="#b19cd9" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
                <XAxis dataKey="period" stroke="#cfd3ff" />
                <YAxis stroke="#cfd3ff" tickFormatter={(v) => nf.format(v as number)} />
                <Tooltip contentStyle={{ background: "#111", border: "1px solid #333", color: "#fff" }}
                  formatter={(val: any, name) => [fmt(val as number), name]} />
                <Legend />
                <Line type="monotone" dataKey="Trendyol" stroke="url(#gradTyUn)" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="Hepsiburada" stroke="url(#gradHbUn)" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <div className="header"><div><DollarSign style={{ width: 18, height: 18 }} /> ROAS</div></div>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tsROAS}>
                <defs>
                  <linearGradient id="gradTyRo" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#ff7f0e" /><stop offset="100%" stopColor="#ffb347" />
                  </linearGradient>
                  <linearGradient id="gradHbRo" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#7c62ff" /><stop offset="100%" stopColor="#b19cd9" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
                <XAxis dataKey="period" stroke="#cfd3ff" />
                <YAxis stroke="#cfd3ff" tickFormatter={(v) => nf.format(v as number)} />
                <Tooltip contentStyle={{ background: "#111", border: "1px solid #333", color: "#fff" }}
                  formatter={(val: any, name) => [(val as number).toFixed(2), name]} />
                <Legend />
                <Line type="monotone" dataKey="Trendyol" stroke="url(#gradTyRo)" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="Hepsiburada" stroke="url(#gradHbRo)" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* TIMELINE (WEEKLY) */}
      <Card>
        <div className="header"><div>Timeline (Weekly)</div></div>
        <div style={{ height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={tsTimeline}>
              <defs>
                <linearGradient id="gRev" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#ff7f0e" /><stop offset="100%" stopColor="#ffb347" />
                </linearGradient>
                <linearGradient id="gSp" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#7c62ff" /><stop offset="100%" stopColor="#b19cd9" />
                </linearGradient>
                <linearGradient id="gUn" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#22c55e" /><stop offset="100%" stopColor="#86efac" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
              <XAxis dataKey="period" stroke="#cfd3ff" />
              <YAxis stroke="#cfd3ff" tickFormatter={(v) => nf.format(v as number)} />
              <Tooltip
                contentStyle={{ background: "#111", border: "1px solid #333", color: "#fff" }}
                formatter={(value: any, name: string) => {
                  if (name === "Units") return [fmt(value as number), name];
                  return [fmtTL(value as number), name];
                }}
              />
              <Legend />
              <Line type="monotone" dataKey="Revenue" stroke="url(#gRev)" strokeWidth={3} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="Spend"   stroke="url(#gSp)"  strokeWidth={3} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="Units"   stroke="url(#gUn)"  strokeWidth={3} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

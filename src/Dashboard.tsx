import React, { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";
import { Layers, TrendingUp, DollarSign, CalendarClock, Trash2 } from "lucide-react";
import { createClient } from '@supabase/supabase-js';

// Supabase ayarları
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || (window as any).VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON || (window as any).VITE_SUPABASE_ANON;
const supabase = (SUPABASE_URL && SUPABASE_ANON) ? createClient(SUPABASE_URL, SUPABASE_ANON) : null;

const Card = ({ className = "", children }: {className?: string, children: any}) => (
  <div className={`card ${className}`}>{children}</div>
);

const CHANNELS = ["Trendyol", "Hepsiburada"] as const;
type Channel = (typeof CHANNELS)[number];
type ChannelDatum = { revenue: number; spend: number; units: number };
type Period = { id: string; label: string; kind: "Monthly" | "Weekly"; data: Record<Channel, ChannelDatum> };
type DailyEntry = { id: string; date: string; channel: Channel; revenue: number; spend: number; units: number };

function pct(curr?: number, prev?: number) {
  if (curr === undefined || prev === undefined) return undefined;
  if (prev === 0) return undefined;
  return ((curr - prev) / prev) * 100;
}

const seedData: Period[] = [
  { id: "2025-06", label: "2025-06", kind: "Monthly", data: { Trendyol: { revenue: 31755, spend: 2000, units: 121 }, Hepsiburada: { revenue: 21510, spend: 1000, units: 66 } } },
  { id: "2025-07", label: "2025-07", kind: "Monthly", data: { Trendyol: { revenue: 35718, spend: 2200, units: 115 }, Hepsiburada: { revenue: 24583, spend: 1100, units: 68 } } },
  { id: "2025-08", label: "2025-08", kind: "Monthly", data: { Trendyol: { revenue: 50162, spend: 4386, units: 199 }, Hepsiburada: { revenue: 27457, spend: 1186, units: 93 } } },
  { id: "2025-09", label: "2025-09 (to date)", kind: "Monthly", data: { Trendyol: { revenue: 26482, spend: 2788, units: 73 }, Hepsiburada: { revenue: 13660, spend: 345, units: 43 } } },
];

export default function Dashboard() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [mode, setMode] = useState<"Monthly" | "Weekly">("Monthly");
  const [dailyEntries, setDailyEntries] = useState<DailyEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const backend: 'supabase'|'local' = supabase ? 'supabase':'local';

  // Günlük giriş alanları
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const [dailyDate, setDailyDate] = useState<string>(`${yyyy}-${mm}-${dd}`);
  const [dailyChannel, setDailyChannel] = useState<Channel>('Trendyol');
  const [dailyRevenue, setDailyRevenue] = useState<number>(0);
  const [dailySpend, setDailySpend] = useState<number>(0);
  const [dailyUnits, setDailyUnits] = useState<number>(0);

  function isoWeek(d: Date) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
    const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return { year: date.getUTCFullYear(), week: weekNo };
  }

  async function loadAll() {
    setLoading(true);
    try {
      if (supabase) {
        const { data: pRows } = await supabase.from('periods').select('*').order('id');
        const { data: dRows } = await supabase.from('daily_entries').select('*').order('date');
        const p: Period[] = (pRows||[]).map((r:any)=>({ id:r.id,label:r.label,kind:r.kind,data:r.data }));
        const d: DailyEntry[] = (dRows||[]).map((r:any)=>({ id:r.id,date:r.date,channel:r.channel,revenue:Number(r.revenue),spend:Number(r.spend),units:Number(r.units) }));
        setPeriods(p.length ? p : seedData);
        setDailyEntries(d);
      } else {
        const lp = localStorage.getItem('vs_dashboard_periods');
        const ld = localStorage.getItem('vs_dashboard_daily');
        setPeriods(lp ? JSON.parse(lp) : seedData);
        setDailyEntries(ld ? JSON.parse(ld) : []);
      }
    } finally { setLoading(false); }
  }
  useEffect(()=>{ loadAll(); }, []);
  useEffect(()=>{
    if (!supabase) {
      localStorage.setItem('vs_dashboard_periods', JSON.stringify(periods));
      localStorage.setItem('vs_dashboard_daily', JSON.stringify(dailyEntries));
    }
  }, [periods, dailyEntries]);

  async function persistPeriod(p: Period) {
    if (supabase) await supabase.from('periods').upsert({ id:p.id,label:p.label,kind:p.kind,data:p.data });
  }
  async function persistDaily(e: DailyEntry, op:'insert'|'delete') {
    if (!supabase) return;
    if (op==='insert') await supabase.from('daily_entries').insert(e);
    else await supabase.from('daily_entries').delete().eq('id', e.id);
  }

  function upsertDelta(kind: 'Monthly'|'Weekly', id: string, label: string, ch: Channel, rev: number, sp: number, un: number, sign: 1|-1=1) {
    setPeriods(prev => {
      const next = [...prev];
      let i = next.findIndex(p => p.id===id && p.kind===kind);
      if (i<0) { next.push({ id,label,kind,data:{Trendyol:{revenue:0,spend:0,units:0}, Hepsiburada:{revenue:0,spend:0,units:0}}}); i = next.length-1; }
      const cur = next[i].data[ch];
      next[i].data[ch] = { revenue:(cur.revenue||0)+rev*sign, spend:(cur.spend||0)+sp*sign, units:(cur.units||0)+un*sign };
      persistPeriod(next[i]);
      return next;
    });
  }

  function addDaily() {
    if (!dailyDate) return;
    const d = new Date(dailyDate + 'T00:00:00');
    const monthId = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const iw = isoWeek(d);
    const weekId = `${iw.year}-W${String(iw.week).padStart(2,'0')}`;
    upsertDelta('Monthly', monthId, monthId, dailyChannel, dailyRevenue, dailySpend, dailyUnits, 1);
    upsertDelta('Weekly', weekId, `${iw.year} W${String(iw.week).padStart(2,'0')}`, dailyChannel, dailyRevenue, dailySpend, dailyUnits, 1);

    const entry: DailyEntry = { id: `${dailyDate}-${dailyChannel}-${Date.now()}`, date: dailyDate, channel: dailyChannel, revenue: dailyRevenue, spend: dailySpend, units: dailyUnits };
    setDailyEntries(prev => { const next=[...prev,entry]; persistDaily(entry,'insert'); return next; });

    setDailyRevenue(0); setDailySpend(0); setDailyUnits(0);
  }

  function deleteDaily(entry: DailyEntry) {
    const d = new Date(entry.date + 'T00:00:00');
    const monthId = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const iw = isoWeek(d);
    const weekId = `${iw.year}-W${String(iw.week).padStart(2,'0')}`;
    upsertDelta('Monthly', monthId, monthId, entry.channel, entry.revenue, entry.spend, entry.units, -1);
    upsertDelta('Weekly', weekId, `${iw.year} W${String(iw.week).padStart(2,'0')}`, entry.channel, entry.revenue, entry.spend, entry.units, -1);
    setDailyEntries(prev => { const next=prev.filter(e=>e.id!==entry.id); persistDaily(entry,'delete'); return next; });
  }

  const filtered = useMemo(()=>periods.filter(p=>p.kind===mode).sort((a,b)=>a.id.localeCompare(b.id)), [periods,mode]);
  const rows = useMemo(()=>filtered.map((p,i)=>{
    const prev = filtered[i-1];
    const calc = (ch:Channel)=>{
      const cur=p.data[ch]; const prv=prev?.data[ch];
      const roas = cur.spend>0 ? cur.revenue/cur.spend : undefined;
      const prevRoas = prv && prv.spend>0 ? prv.revenue/prv.spend : undefined;
      const pct = (a?:number,b?:number)=> (a===undefined||b===undefined||b===0)?undefined:((a-b)/b)*100;
      return { roas, momRev:pct(cur?.revenue,prv?.revenue), momSpend:pct(cur?.spend,prv?.spend), momUnits:pct(cur?.units,prv?.units), momRoas:pct(roas,prevRoas) };
    };
    return { ...p, meta:{Trendyol:calc('Trendyol'), Hepsiburada:calc('Hepsiburada')} };
  }), [filtered]);

  const ts = (key: keyof ChannelDatum) => rows.map(r=>({ period:r.label, Trendyol:r.data.Trendyol[key], Hepsiburada:r.data.Hepsiburada[key] }));
  const tsRevenue = useMemo(()=>ts('revenue'),[rows]);
  const tsSpend   = useMemo(()=>ts('spend'),[rows]);
  const tsUnits   = useMemo(()=>ts('units'),[rows]);
  const tsROAS    = useMemo(()=>rows.map(r=>({ period:r.label, Trendyol:r.meta.Trendyol.roas ?? 0, Hepsiburada:r.meta.Hepsiburada.roas ?? 0 })),[rows]);

  if (loading) return <div style={{padding:20}}>Loading…</div>;

  return (
    <div style={{padding:24}}>
      <div className="header">
        <h1><Layers style={{width:20,height:20,verticalAlign:'-3px'}}/> Vibrant Skin Dashboard</h1>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <select value={mode} onChange={e=>setMode(e.target.value as any)}>
            <option value="Monthly">Monthly View</option>
            <option value="Weekly">Weekly View</option>
          </select>
          <span className="small">Storage: <b>{backend}</b></span>
        </div>
      </div>

      <Card>
        <div className="hgrid" style={{gridTemplateColumns:'repeat(6, minmax(0,1fr))'}}>
          <div><div className="small">Date</div><input type="date" value={dailyDate} onChange={e=>setDailyDate(e.target.value)} /></div>
          <div><div className="small">Channel</div><select value={dailyChannel} onChange={e=>setDailyChannel(e.target.value as any)}><option>Trendyol</option><option>Hepsiburada</option></select></div>
          <div><div className="small">Revenue (TL)</div><input type="number" value={dailyRevenue} onChange={e=>setDailyRevenue(parseFloat(e.target.value||'0'))} /></div>
          <div><div className="small">Spend (TL)</div><input type="number" value={dailySpend} onChange={e=>setDailySpend(parseFloat(e.target.value||'0'))} /></div>
          <div><div className="small">Units</div><input type="number" value={dailyUnits} onChange={e=>setDailyUnits(parseFloat(e.target.value||'0'))} /></div>
          <div style={{display:'flex',alignItems:'end'}}><button onClick={addDaily}>Add Day</button></div>
        </div>
        <div className="small" style={{marginTop:6}}>Günlük giriş ay ve ISO haftasına otomatik eklenir. Backend: {backend==='supabase'?'Supabase':'LocalStorage'}</div>

        <div style={{marginTop:12,overflowX:'auto'}}>
          <table>
            <thead><tr><th>Date</th><th>Channel</th><th>Revenue</th><th>Spend</th><th>Units</th><th>Action</th></tr></thead>
            <tbody>
              {dailyEntries.map(e=>(
                <tr key={e.id}>
                  <td>{e.date}</td><td>{e.channel}</td><td>{e.revenue}</td><td>{e.spend}</td><td>{e.units}</td>
                  <td><button onClick={()=>deleteDaily(e)} title="Delete"><Trash2 style={{width:16,height:16}}/></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="hgrid grid2" style={{marginTop:16}}>
        <Card>
          <div className="header"><div><TrendingUp style={{width:18,height:18}}/> Revenue</div></div>
          <div style={{height:300}}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tsRevenue}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="period"/><YAxis/><Tooltip/><Legend/><Line type="monotone" dataKey="Trendyol" stroke="#4f46e5" /><Line type="monotone" dataKey="Hepsiburada" stroke="#16a34a" /></LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <div className="header"><div><DollarSign style={{width:18,height:18}}/> Spend</div></div>
          <div style={{height:300}}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tsSpend}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="period"/><YAxis/><Tooltip/><Legend/><Line type="monotone" dataKey="Trendyol" stroke="#4f46e5" /><Line type="monotone" dataKey="Hepsiburada" stroke="#16a34a" /></LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
      <div className="hgrid grid2" style={{marginTop:16}}>
        <Card>
          <div className="header"><div><CalendarClock style={{width:18,height:18}}/> Units</div></div>
          <div style={{height:300}}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tsUnits}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="period"/><YAxis/><Tooltip/><Legend/><Line type="monotone" dataKey="Trendyol" stroke="#4f46e5" /><Line type="monotone" dataKey="Hepsiburada" stroke="#16a34a" /></LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <div className="header"><div><DollarSign style={{width:18,height:18}}/> ROAS</div></div>
          <div style={{height:300}}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tsROAS}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="period"/><YAxis/><Tooltip/><Legend/><Line type="monotone" dataKey="Trendyol" stroke="#4f46e5" /><Line type="monotone" dataKey="Hepsiburada" stroke="#16a34a" /></LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}

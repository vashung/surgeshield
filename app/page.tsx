"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import './page.css';

// ─── Types ────────────────────────────────────────────────────────────────────
interface District {
  district: string;
  stress_level: string;
  avg_cases: number;
  max_cases: number;
  total_beds: number;
  icu_beds: number;
  platelet_stock: number;
  available_staff: number;
  cases_per_bed: number;
  // enriched client-side
  risk?: number;
  pred7?: number;
  pred14?: number;
  rain?: number;
  temp?: number;
  hum?: number;
}

interface Message { role: "user" | "ai"; text: string; time: Date; }

// ─── Styles ───────────────────────────────────────────────────────────────────
const STYLES = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --ink:#1a1208; --paper:#f5efe4; --paper2:#ede5d4; --paper3:#e3d9c6;
    --amber:#c8690a; --amber-lt:#e8820d; --red:#c0392b; --red-lt:#e74c3c;
    --green:#1a6b3a; --green-lt:#27ae60; --yellow:#c49a00;
    --muted:#7a6a54; --border:#c8b898; --border-dk:#a8956a;
    --shadow:rgba(26,18,8,.12);
    --ff-head:'JetBrains Mono',serif;
    --ff-mono:'IBM Plex Mono',monospace;
    --ff-body:'IBM Plex Sans',sans-serif;
  }
  body { background:var(--paper); color:var(--ink); font-family:var(--ff-body); }
  ::-webkit-scrollbar { width:5px; height:5px; }
  ::-webkit-scrollbar-track { background:var(--paper2); }
  ::-webkit-scrollbar-thumb { background:var(--border-dk); border-radius:3px; }
  @keyframes fadeUp   { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
  @keyframes fadeIn   { from{opacity:0} to{opacity:1} }
  @keyframes pulse    { 0%,100%{opacity:1} 50%{opacity:.35} }
  @keyframes ticker   { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
  @keyframes dotBlink { 0%,80%,100%{opacity:0} 40%{opacity:1} }
  @keyframes spin     { to{transform:rotate(360deg)} }
  .fu  { animation:fadeUp .4s ease both; }
  .fu2 { animation:fadeUp .4s .08s ease both; }
  .fu3 { animation:fadeUp .4s .16s ease both; }
  .fu4 { animation:fadeUp .4s .24s ease both; }
  .fi  { animation:fadeIn .4s ease both; }
`;


// ─── Helpers ──────────────────────────────────────────────────────────────────
const stressNorm = (s: string) => {
  if (!s) return "Low";
  const v = s.replace(/[^a-zA-Z]/g, "").trim();
  if (v.toLowerCase().includes("critical") || v.toLowerCase().includes("high") && parseFloat(s) > 5) return "Critical";
  if (v.toLowerCase().includes("high"))     return "High";
  if (v.toLowerCase().includes("medium") || v.toLowerCase().includes("moderate")) return "Moderate";
  return "Low";
};

const sc  = (s: string) => ({ Critical:"var(--danger)", High:"var(--accent)", Moderate:"#a78bfa", Low:"var(--success)" }[s] ?? "var(--muted)");
const scl = (s: string) => ({ Critical:"var(--danger)", High:"var(--accent-lt)", Moderate:"#d8b4fe", Low:"var(--success)" }[s] ?? "var(--muted)");
const si  = (s: string) => ({ Critical:"▲▲", High:"▲", Moderate:"◆", Low:"●" }[s] ?? "○");
const fmt = (n: any)    => n?.toLocaleString() ?? "—";

// Derive risk score from cases_per_bed
const riskScore = (d: District) => Math.min(100, Math.round((d.cases_per_bed / 8) * 100));

// ─── Fallback mock data (shown when S3 not ready) ─────────────────────────────
const MOCK_DISTRICTS: District[] = [
  { district:"Bangalore Urban", stress_level:"High",   avg_cases:430, max_cases:510, total_beds:1200, icu_beds:150, platelet_stock:210, available_staff:85, cases_per_bed:5.8, risk:92, pred7:487, pred14:541, rain:18.2, temp:27.4, hum:82 },
  { district:"Hassan",          stress_level:"High",   avg_cases:390, max_cases:460, total_beds:750,  icu_beds:80,  platelet_stock:160, available_staff:61, cases_per_bed:6.3, risk:88, pred7:421, pred14:468, rain:22.1, temp:26.1, hum:86 },
  { district:"Kolar",           stress_level:"High",   avg_cases:355, max_cases:400, total_beds:620,  icu_beds:62,  platelet_stock:280, available_staff:52, cases_per_bed:5.2, risk:74, pred7:388, pred14:410, rain:14.5, temp:28.9, hum:74 },
  { district:"Mysuru",          stress_level:"Medium", avg_cases:210, max_cases:260, total_beds:900,  icu_beds:90,  platelet_stock:390, available_staff:72, cases_per_bed:3.1, risk:61, pred7:235, pred14:251, rain:11.3, temp:26.8, hum:78 },
  { district:"Chikkaballapur",  stress_level:"Medium", avg_cases:201, max_cases:240, total_beds:480,  icu_beds:48,  platelet_stock:310, available_staff:44, cases_per_bed:3.4, risk:48, pred7:219, pred14:228, rain:9.8,  temp:27.2, hum:72 },
  { district:"Mandya",          stress_level:"Medium", avg_cases:178, max_cases:210, total_beds:550,  icu_beds:55,  platelet_stock:355, available_staff:48, cases_per_bed:2.8, risk:42, pred7:192, pred14:204, rain:8.2,  temp:27.9, hum:70 },
  { district:"Tumkur",          stress_level:"Low",    avg_cases:95,  max_cases:120, total_beds:600,  icu_beds:60,  platelet_stock:580, available_staff:55, cases_per_bed:1.2, risk:18, pred7:88,  pred14:82,  rain:5.1,  temp:29.1, hum:61 },
  { district:"Ramanagara",      stress_level:"Low",    avg_cases:62,  max_cases:80,  total_beds:400,  icu_beds:40,  platelet_stock:640, available_staff:38, cases_per_bed:0.9, risk:11, pred7:58,  pred14:54,  rain:3.8,  temp:29.6, hum:58 },
];

const WEEKLY = [
  {w:"W1",cases:820},{w:"W2",cases:940},{w:"W3",cases:1105},{w:"W4",cases:1280},
  {w:"W5",cases:1190},{w:"W6",cases:1430},{w:"W7",cases:1620},{w:"W8",cases:1510},
  {w:"W9",cases:1780},{w:"W10",cases:1921},
];

const MODELS = [
  { name:"Random Forest",     mae:12.4, rmse:18.7, r2:0.94, best:true  },
  { name:"Gradient Boosting", mae:14.1, rmse:21.2, r2:0.91, best:false },
  { name:"Linear Regression", mae:28.9, rmse:38.4, r2:0.73, best:false },
];

const STARTERS = [
  "Hospital capacity of Bangalore Urban?",
  "Which districts need immediate action?",
  "Run full analysis for all districts",
  "Dengue forecast for next 7 days",
  "Which model has best accuracy?",
];

// ─── SVG Map positions ────────────────────────────────────────────────────────
const POS: Record<string, {x:number;y:number}> = {
  "Bangalore Urban":{x:310,y:300}, "Hassan":{x:165,y:255}, "Kolar":{x:390,y:230},
  "Mysuru":{x:185,y:320}, "Chikkaballapur":{x:365,y:185}, "Mandya":{x:230,y:315},
  "Tumkur":{x:278,y:245}, "Ramanagara":{x:295,y:330},
};

// ─── Loading Skeleton ─────────────────────────────────────────────────────────
function Skeleton({ w="100%", h=20, mb=0 }: { w?: string|number; h?: number; mb?: number }) {
  return <div style={{ width:w, height:h, marginBottom:mb, background:"linear-gradient(90deg,var(--paper3) 25%,var(--paper2) 50%,var(--paper3) 75%)", backgroundSize:"400px 100%", animation:"pulse 1.5s infinite", borderRadius:4 }}/>;
}

// ─── Alert Ticker ─────────────────────────────────────────────────────────────
function Ticker({ districts }: { districts: District[] }) {
  const alerts = districts.filter(d => {
    const s = stressNorm(d.stress_level);
    return s === "Critical" || s === "High";
  });
  if (!alerts.length) return null;
  const text = alerts.map(d => `${si(stressNorm(d.stress_level))} ${d.district.toUpperCase()} — ${stressNorm(d.stress_level)} Risk · ${Math.round(d.avg_cases)} cases · ${d.cases_per_bed}% util`).join("    ·    ");
  const full = `${text}    ·    ${text}    `;
  return (
    <div style={{ background:"var(--grad-danger)", overflow:"hidden", height:28, display:"flex", alignItems:"center", borderBottom:"none" }}>
      <div style={{ background:"rgba(255,255,255,.95)", color:"#1a1a1a", padding:"0 14px", fontSize:10, fontFamily:"var(--ff-mono)", fontWeight:600, letterSpacing:"1.5px", whiteSpace:"nowrap", height:"100%", display:"flex", alignItems:"center", flexShrink:0 }}>ALERTS</div>
      <div style={{ overflow:"hidden", flex:1, height:"100%" }}>
        <div style={{ display:"inline-block", whiteSpace:"nowrap", animation:"ticker 28s linear infinite", fontSize:10, fontFamily:"var(--ff-mono)", color:"#ffffff", letterSpacing:".8px", lineHeight:"28px" }}>{full}{full}</div>
      </div>
    </div>
  );
}

// ─── TopBar ───────────────────────────────────────────────────────────────────
function TopBar({ tab, setTab, lastRun }: { tab:string; setTab:(t:string)=>void; lastRun:string|null }) {
  const tabs = [
    "Situation Map",
    "Heatmap",
    "Inventory",
    "Risk Card",
    "Capacity",
    "Predictions",
    "AI Briefing"
  ];
  const now = new Date().toLocaleString("en-IN", { timeZone:"Asia/Kolkata", dateStyle:"medium", timeStyle:"short" });
  return (
    <header style={{ background:"var(--grad-ai)", color:"#ffffff", borderBottom:"1px solid rgba(99,102,241,.1)", boxShadow:"0 8px 32px var(--shadow)", position:"sticky", top:0, zIndex:200, backdropFilter:"blur(10px)" }}>
      <div style={{ display:"flex", alignItems:"center", padding:"0 28px" }}>
        <div style={{ padding:"12px 0", marginRight:36, display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:36, height:36, borderRadius:4, background:"var(--amber)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>🛡️</div>
          <div>
            <div style={{ fontFamily:"var(--ff-head)", fontSize:18, fontWeight:900, lineHeight:1 }}>SurgeShield</div>
            <div style={{ fontSize:9, letterSpacing:"2.5px", color:"#6366f1", fontFamily:"var(--ff-mono)", marginTop:2 }}>PUBLIC HEALTH COMMAND</div>
          </div>
        </div>
        <nav style={{ display:"flex", flex:1 }}>
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ background:"none", border:"none", cursor:"pointer", padding:"18px 20px", fontSize:11, fontFamily:"var(--ff-mono)", fontWeight:500, letterSpacing:"1px", textTransform:"uppercase", color:tab===t?"#6366f1":"rgba(107,114,128,.7)", borderBottom:tab===t?"2px solid #6366f1":"2px solid transparent", marginBottom:"-2px", transition:"all .2s" }}>{t}</button>
          ))}
        </nav>
        <div style={{ fontSize:10, fontFamily:"var(--ff-mono)", color:"rgba(255,255,255,.7)", textAlign:"right" }}>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ width:6, height:6, borderRadius:"50%", background:"rgba(99,102,241,.8)", display:"inline-block", animation:"pulse 2s infinite" }}/>
            LIVE · IST
          </div>
          <div style={{ marginTop:2, color:"rgba(107,114,128,.8)" }}>{lastRun ? `Last run: ${new Date(lastRun).toLocaleTimeString("en-IN",{timeStyle:"short"})}` : now}</div>
        </div>
      </div>
    </header>
  );
}

// ─── Situation Map ────────────────────────────────────────────────────────────
function SituationMap({ districts, loading }: { districts: District[]; loading: boolean }) {
  const [sel, setSel] = useState<string|null>(null);
  const sd = sel ? districts.find(d => d.district === sel) : null;
  const total = districts.reduce((a,d) => a + d.avg_cases, 0);
  const critical = districts.filter(d => ["Critical","High"].includes(stressNorm(d.stress_level))).length;

  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 360px", height:"calc(100vh - 110px)", background:"linear-gradient(135deg,#ffffff,#f3f4f6)" }}>
      <div style={{ position:"relative", background:"var(--paper)", borderRight:"1px solid var(--border)" }}>
        {/* stat strip */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", borderBottom:"1px solid var(--border)", background:"var(--paper)", position:"relative", zIndex:10 }}>
          {[
            { l:"Total Active Cases",   v: loading ? null : fmt(Math.round(total)),              c:"var(--ink)"   },
            { l:"Critical/High Risk",   v: loading ? null : critical,                            c:"var(--red)"   },
            { l:"Districts Monitored",  v: loading ? null : districts.length,                   c:"var(--ink)"   },
            { l:"Avg Utilisation",      v: loading ? null : `${(districts.reduce((a,d)=>a+d.cases_per_bed,0)/Math.max(districts.length,1)).toFixed(1)}%`, c:"var(--ink)" },
          ].map((s,i) => (
            <div key={i} style={{ padding:"14px 20px", borderRight:i<3?"1px solid var(--border)":"none" }}>
              <div style={{ fontSize:9, fontFamily:"var(--ff-mono)", letterSpacing:"1.2px", color:"var(--muted)", textTransform:"uppercase", marginBottom:4 }}>{s.l}</div>
              {loading ? <Skeleton h={32}/> : <div style={{ fontFamily:"var(--ff-head)", fontSize:28, fontWeight:900, color:s.c, lineHeight:1 }}>{s.v}</div>}
            </div>
          ))}
        </div>

        {/* SVG Map */}
        <div style={{ position:"absolute", top:80, left:0, right:0, bottom:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
          {loading ? (
            <div style={{ textAlign:"center", color:"var(--muted)", fontFamily:"var(--ff-mono)", fontSize:12 }}>
              <div style={{ width:28, height:28, border:"2px solid var(--border)", borderTopColor:"var(--amber)", borderRadius:"50%", animation:"spin 1s linear infinite", margin:"0 auto 12px" }}/>
              Loading district data...
            </div>
          ) : (
            <svg viewBox="60 120 460 320" style={{ width:"100%", height:"100%", maxHeight:480 }}>
              <path d="M120,160 Q140,140 180,145 Q240,135 300,150 Q360,140 410,160 Q450,175 460,210 Q470,250 455,290 Q440,330 410,360 Q380,390 340,400 Q300,415 260,410 Q220,415 185,400 Q150,380 130,350 Q108,315 105,275 Q98,235 110,200 Z" fill="none" stroke="var(--border-dk)" strokeWidth="1.5" strokeDasharray="6 3" opacity=".5"/>
              {districts.map(d => {
                const p = POS[d.district];
                if (!p) return null;
                const stress = stressNorm(d.stress_level);
                const isSel = sel === d.district;
                const r = 14 + (riskScore(d)/100)*16;
                return (
                  <g key={d.district} onClick={() => setSel(isSel ? null : d.district)} style={{ cursor:"pointer" }}>
                    {(stress==="Critical"||stress==="High") && <circle cx={p.x} cy={p.y} r={r+10} fill="none" stroke={sc(stress)} strokeWidth="1" opacity=".25" style={{ animation:"pulse 2s infinite" }}/>}
                    <circle cx={p.x} cy={p.y} r={r} fill={`${sc(stress)}1a`} stroke={sc(stress)} strokeWidth={isSel?2.5:1.5}/>
                    <circle cx={p.x} cy={p.y} r={isSel?7:5} fill={sc(stress)}/>
                    <text x={p.x} y={p.y+r+13} textAnchor="middle" fontSize="9" fontFamily="var(--ff-mono)" fill="var(--ink)" fontWeight="600">{d.district.split(" ")[0].toUpperCase()}</text>
                    <text x={p.x} y={p.y+r+23} textAnchor="middle" fontSize="8" fontFamily="var(--ff-mono)" fill={sc(stress)}>{Math.round(d.avg_cases)}</text>
                  </g>
                );
              })}
              <g transform="translate(75,400)">
                {["Critical","High","Moderate","Low"].map((s,i) => (
                  <g key={s} transform={`translate(${i*90},0)`}>
                    <circle cx="5" cy="5" r="5" fill={`${sc(s)}1a`} stroke={sc(s)} strokeWidth="1.5"/>
                    <text x="14" y="9" fontSize="8" fontFamily="var(--ff-mono)" fill="var(--muted)">{s}</text>
                  </g>
                ))}
              </g>
            </svg>
          )}
        </div>
        {!sel && !loading && <div style={{ position:"absolute", bottom:16, left:"50%", transform:"translateX(-50%)", fontSize:10, fontFamily:"var(--ff-mono)", color:"var(--muted)", letterSpacing:".8px" }}>↑ CLICK A DISTRICT FOR DETAILS</div>}
      </div>

      {/* Side panel */}
      <div style={{ overflowY:"auto", background:"var(--paper)" }}>
        {sd ? <DistrictDetail d={sd} onClose={() => setSel(null)}/> : <DistrictList districts={districts} loading={loading} onSelect={setSel}/>}
      </div>
    </div>
  );
}

function DistrictList({ districts, loading, onSelect }: { districts:District[]; loading:boolean; onSelect:(n:string)=>void }) {
  return (
    <div>
      <div style={{ padding:"16px 20px", borderBottom:"1px solid var(--border)", background:"linear-gradient(135deg,#ffffff,#f3f4f6)" }}>
        <div style={{ fontFamily:"var(--ff-head)", fontSize:17, fontWeight:700 }}>District Risk Register</div>
        <div style={{ fontSize:10, fontFamily:"var(--ff-mono)", color:"var(--muted)", marginTop:2, letterSpacing:".8px" }}>SORTED BY RISK · CLICK TO EXPAND</div>
      </div>
      {loading ? Array(5).fill(0).map((_,i) => <div key={i} style={{ padding:"16px 20px", borderBottom:"1px solid var(--border)" }}><Skeleton h={16} mb={8}/><Skeleton h={8} w="60%"/></div>) :
        [...districts].sort((a,b) => riskScore(b)-riskScore(a)).map((d,i) => {
          const stress = stressNorm(d.stress_level);
          return (
            <div key={d.district} onClick={() => onSelect(d.district)} className="fu" style={{ animationDelay:`${i*.04}s`, borderBottom:"1px solid var(--border)", padding:"14px 20px", cursor:"pointer", transition:"background .15s" }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background="var(--paper2)"}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background="transparent"}
            >
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                <div>
                  <div style={{ fontWeight:600, fontSize:13 }}>{d.district}</div>
                  <div style={{ fontSize:10, fontFamily:"var(--ff-mono)", color:"var(--muted)", marginTop:1 }}>{Math.round(d.avg_cases)} avg cases · beds {d.total_beds}</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:11, fontFamily:"var(--ff-mono)", fontWeight:600, color:sc(stress) }}>{si(stress)} {stress.toUpperCase()}</div>
                  <div style={{ fontFamily:"var(--ff-head)", fontSize:22, fontWeight:900, color:sc(stress), lineHeight:1.1 }}>{riskScore(d)}</div>
                  <div style={{ fontSize:8, fontFamily:"var(--ff-mono)", color:"var(--muted)" }}>RISK SCORE</div>
                </div>
              </div>
              <div style={{ height:4, background:"var(--paper3)", borderRadius:2, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${Math.min(d.cases_per_bed/8*100,100)}%`, background:sc(stress), borderRadius:2 }}/>
              </div>
              <div style={{ fontSize:9, fontFamily:"var(--ff-mono)", color:"var(--muted)", marginTop:4 }}>
                BED UTIL {d.cases_per_bed}% · PLATELETS {d.platelet_stock}{d.platelet_stock<250?" ⚠":""}
              </div>
            </div>
          );
        })
      }
    </div>
  );
}

function DistrictDetail({ d, onClose }: { d:District; onClose:()=>void }) {
  const stress = stressNorm(d.stress_level);
  const risk = riskScore(d);
  const actions = stress==="Critical"||stress==="High"
    ? ["Immediate resource mobilisation — transfer non-critical patients", "Emergency platelet procurement within 48 hrs", "Activate district emergency response protocol", "Deploy reserve staff from state pool"]
    : stress==="Moderate"
    ? ["Monitor bed utilisation hourly", "Pre-position platelet reserves", "Alert neighbouring districts to prepare capacity"]
    : ["Maintain current surveillance frequency", "Continue weekly capacity reporting"];

  return (
    <div className="fi">
      <div style={{ padding:"14px 20px", background:"linear-gradient(135deg,#ffffff,#f3f4f6)", borderBottom:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <div style={{ fontFamily:"var(--ff-head)", fontSize:16, fontWeight:700 }}>{d.district}</div>
          <div style={{ fontSize:10, fontFamily:"var(--ff-mono)", color:sc(stress), fontWeight:600, marginTop:2, letterSpacing:"1px" }}>{si(stress)} {stress.toUpperCase()} · SCORE {risk}/100</div>
        </div>
        <button onClick={onClose} style={{ background:"none", border:"1px solid var(--border)", borderRadius:4, padding:"5px 10px", fontSize:10, fontFamily:"var(--ff-mono)", cursor:"pointer", color:"var(--muted)" }}>✕ CLOSE</button>
      </div>
      <div style={{ padding:"16px 20px 0" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
          <div style={{ flex:1, height:10, background:"var(--paper3)", borderRadius:5, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${risk}%`, background:`linear-gradient(90deg,${sc(stress)},${scl(stress)})`, borderRadius:5 }}/>
          </div>
          <span style={{ fontFamily:"var(--ff-mono)", fontSize:11, fontWeight:600, color:sc(stress) }}>{risk}%</span>
        </div>
      </div>
      <div style={{ padding:"0 20px 16px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
        {[
          { l:"Avg Active Cases",  v:Math.round(d.avg_cases),   w:d.avg_cases>400 },
          { l:"Max Cases Seen",    v:d.max_cases,               w:false },
          { l:"Total Beds",        v:d.total_beds,              w:false },
          { l:"ICU Beds",          v:d.icu_beds,                w:false },
          { l:"Platelet Stock",    v:d.platelet_stock,          w:d.platelet_stock<250 },
          { l:"Available Staff",   v:d.available_staff,         w:d.available_staff<50 },
          { l:"Bed Utilisation",   v:`${d.cases_per_bed}%`,     w:d.cases_per_bed>5 },
          { l:"Cases / ICU Bed",   v:`${(d.avg_cases/Math.max(d.icu_beds,1)).toFixed(1)}x`, w:d.avg_cases/Math.max(d.icu_beds,1)>3 },
        ].map(item => (
          <div key={item.l} style={{ background:item.w?`${sc(stress)}0d`:"var(--paper2)", border:`1px solid ${item.w?sc(stress)+"44":"var(--border)"}`, borderRadius:6, padding:"11px 14px" }}>
            <div style={{ fontSize:9, fontFamily:"var(--ff-mono)", color:"var(--muted)", letterSpacing:"1px", marginBottom:4 }}>{item.l.toUpperCase()}</div>
            <div style={{ fontFamily:"var(--ff-head)", fontSize:22, fontWeight:900, color:item.w?sc(stress):"var(--ink)", lineHeight:1 }}>{item.v}</div>
            {item.w && <div style={{ fontSize:9, color:sc(stress), fontFamily:"var(--ff-mono)", marginTop:2 }}>⚠ Attention required</div>}
          </div>
        ))}
      </div>
      <div style={{ margin:"0 20px 24px", padding:"16px", background:"var(--grad-ai)", borderRadius:8, color:"#ffffff" }}>
        <div style={{ fontSize:10, fontFamily:"var(--ff-mono)", letterSpacing:"1.2px", color:"rgba(255,255,255,.8)", marginBottom:10, fontWeight:600 }}>RECOMMENDED ACTIONS</div>
        {actions.map((a,i) => <div key={i} style={{ fontSize:11, fontFamily:"var(--ff-body)", color:"rgba(255,255,255,.9)", marginBottom:6, display:"flex", gap:8 }}><span style={{ color:"rgba(255,255,255,.9)", flexShrink:0 }}>→</span>{a}</div>)}
      </div>
    </div>
  );
}

// ─── Capacity Tab ─────────────────────────────────────────────────────────────
function CapacityTab({ districts, loading }: { districts:District[]; loading:boolean }) {
  const [filter, setFilter] = useState("All");
  const shown = filter==="All" ? districts : districts.filter(d => stressNorm(d.stress_level)===filter);
  return (
    <div style={{ padding:28, background:"linear-gradient(135deg,#000000,#130F40)" }}>
      <div className="fu" style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:20 }}>
        <div>
          <div style={{ fontFamily:"var(--ff-head)", fontSize:26, fontWeight:900, lineHeight:1 }}>Hospital Capacity</div>
          <div style={{ fontSize:11, fontFamily:"var(--ff-mono)", color:"var(--muted)", marginTop:6, letterSpacing:".8px" }}>BED UTILISATION & RESOURCE STATUS — LIVE FROM S3</div>
        </div>
        <div style={{ display:"flex", gap:6 }}>
          {["All","Critical","High","Moderate","Low"].map(l => (
            <button key={l} onClick={() => setFilter(l)} style={{ padding:"8px 16px", fontSize:10, fontFamily:"var(--ff-mono)", letterSpacing:".8px", border:`2px solid ${filter===l?sc(l==="All"?"Low":l):"var(--border)"}`, background:filter===l?`var(--grad-ai)`:"transparent", color:filter===l?"#ffffff":sc(l==="All"?"Low":l), borderRadius:6, cursor:"pointer", transition:"all .3s", fontWeight:600 }}>{l.toUpperCase()}</button>
          ))}
        </div>
      </div>
      <div className="fu2" style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:22 }}>
        {loading ? Array(4).fill(0).map((_,i) => <div key={i} className="card" style={{ padding:"16px 18px" }}><Skeleton h={10} mb={8}/><Skeleton h={28}/></div>) :
          [
            { l:"Total Beds",           v:fmt(districts.reduce((a,d)=>a+d.total_beds,0)),    c:"var(--ink)"   },
            { l:"Total ICU Beds",       v:fmt(districts.reduce((a,d)=>a+d.icu_beds,0)),      c:"var(--ink)"   },
            { l:"Low Platelet Alerts",  v:`${districts.filter(d=>d.platelet_stock<300).length} districts`,   c:"var(--amber)" },
            { l:"Critical Utilisation", v:`${districts.filter(d=>d.cases_per_bed>5).length} districts`,     c:"var(--red)"   },
          ].map((s,i) => (
            <div key={i} className="card" style={{ padding:"14px 18px", borderLeft:`4px solid ${s.c}` }}>
              <div style={{ fontSize:9, fontFamily:"var(--ff-mono)", color:"var(--muted)", letterSpacing:"1px", marginBottom:5 }}>{s.l.toUpperCase()}</div>
              <div style={{ fontFamily:"var(--ff-head)", fontSize:24, fontWeight:900, color:s.c }}>{s.v}</div>
            </div>
          ))
        }
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:16 }}>
        {loading ? Array(4).fill(0).map((_,i) => <div key={i} style={{ background:"var(--paper)", border:"1px solid var(--border)", borderRadius:10, padding:20 }}><Skeleton h={20} mb={12}/><Skeleton h={10} mb={16}/><div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:8 }}>{Array(4).fill(0).map((_,j)=><Skeleton key={j} h={60}/>)}</div></div>) :
          [...shown].sort((a,b) => b.cases_per_bed-a.cases_per_bed).map((d,i) => {
            const stress = stressNorm(d.stress_level);
            return (
              <div key={d.district} className="fu card" style={{ animationDelay:`${i*.05}s`, overflow:"hidden" }}>
                <div style={{ padding:"13px 18px", background:"var(--paper2)", borderBottom:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div><div style={{ fontWeight:600, fontSize:14 }}>{d.district}</div><div style={{ fontSize:10, fontFamily:"var(--ff-mono)", color:"var(--muted)", marginTop:1 }}>{Math.round(d.avg_cases)} avg · {d.max_cases} peak</div></div>
                  <div style={{ fontSize:11, fontFamily:"var(--ff-mono)", fontWeight:600, color:sc(stress), letterSpacing:"1px" }}>{si(stress)} {stress.toUpperCase()}</div>
                </div>
                <div style={{ padding:"13px 18px 10px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, fontFamily:"var(--ff-mono)", marginBottom:6 }}>
                    <span style={{ color:"var(--muted)", letterSpacing:".8px" }}>BED UTILISATION</span>
                    <span style={{ color:sc(stress), fontWeight:600 }}>{d.cases_per_bed}%</span>
                  </div>
                  <div style={{ height:10, background:"var(--paper3)", borderRadius:3, overflow:"hidden" }}>
                    <div style={{ height:"100%", width:`${Math.min(d.cases_per_bed/8*100,100)}%`, background:`linear-gradient(90deg,${sc(stress)},${scl(stress)})`, borderRadius:3 }}/>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:8, fontFamily:"var(--ff-mono)", color:"var(--muted)", marginTop:3 }}>
                    <span>0%</span><span style={{ color:"var(--amber)" }}>2% MOD</span><span style={{ color:"var(--red)" }}>5% CRIT</span><span>8%</span>
                  </div>
                </div>
                <div style={{ padding:"0 18px 16px", display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:7 }}>
                  {[{l:"Beds",v:d.total_beds,w:false},{l:"ICU",v:d.icu_beds,w:false},{l:"Platelets",v:d.platelet_stock,w:d.platelet_stock<300},{l:"Staff",v:d.available_staff,w:d.available_staff<50}].map(r => (
                    <div key={r.l} style={{ textAlign:"center", padding:"9px 5px", background:r.w?`${sc(stress)}0d`:"var(--paper2)", border:`1px solid ${r.w?sc(stress)+"33":"var(--border)"}`, borderRadius:6 }}>
                      <div style={{ fontFamily:"var(--ff-head)", fontSize:19, fontWeight:900, color:r.w?sc(stress):"var(--ink)", lineHeight:1 }}>{r.v}</div>
                      <div style={{ fontSize:8, fontFamily:"var(--ff-mono)", color:"var(--muted)", marginTop:3, letterSpacing:".8px" }}>{r.l.toUpperCase()}</div>
                      {r.w && <div style={{ fontSize:8, color:sc(stress), marginTop:2 }}>⚠ LOW</div>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        }
      </div>
    </div>
  );
}

// ─── Bar Chart (horizontal) ─────────────────────────────────────────────────
function BarChart({ districts }: { districts: District[] }) {
  const sorted = [...districts].sort((a,b)=>b.avg_cases - a.avg_cases);
  const max = sorted[0]?.avg_cases || 1;
  return (
    <div style={{ marginBottom:22 }}>
      <div style={{ fontFamily:"var(--ff-head)", fontSize:16, fontWeight:700, marginBottom:12 }}>Average Cases by District</div>
      <svg viewBox={`0 0 600 ${sorted.length * 24}`} style={{ width:"100%", height:"auto" }}>
        {sorted.map((d,i) => {
          const w = (d.avg_cases / max) * 550;
          return (
            <g key={d.district} transform={`translate(0,${i*24})`}>
              <rect x={0} y={4} width={w} height={16} fill="var(--accent)" />
              <text x={w+6} y={16} fontSize="10" fontFamily="var(--ff-mono)" fill="var(--ink)">{Math.round(d.avg_cases)}</text>
              <text x={0} y={-2} fontSize="9" fontFamily="var(--ff-mono)" fill="var(--muted)">{d.district}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Predictions Tab ──────────────────────────────────────────────────────────
function PredictionsTab({ districts, loading }: { districts:District[]; loading:boolean }) {
  const [mi, setMi] = useState(0);
  const W=560, H=160, pL=38, pB=28, pT=12, pR=12;
  const maxC = Math.max(...WEEKLY.map(d => d.cases));
  const cx = (i:number) => pL+(i/(WEEKLY.length-1))*(W-pL-pR);
  const cy = (v:number, mx:number) => pT+(1-(v/mx))*(H-pT-pB);
  const cp = WEEKLY.map((d,i) => `${i===0?"M":"L"}${cx(i)},${cy(d.cases,maxC)}`).join(" ");
  const ca = `${cp} L${cx(WEEKLY.length-1)},${H-pB} L${cx(0)},${H-pB} Z`;

  return (
    <div style={{ padding:28, background:"linear-gradient(135deg,#000000,#130F40)" }}>
      <div className="fu" style={{ fontFamily:"var(--ff-head)", fontSize:26, fontWeight:900, marginBottom:6, color:"var(--ink)" }}>Dengue Forecast</div>
      <div className="fu2" style={{ fontSize:11, fontFamily:"var(--ff-mono)", color:"var(--muted)", letterSpacing:".8px", marginBottom:22 }}>ML-POWERED PREDICTIONS · LIVE FROM SAGEMAKER PIPELINE</div>
      {/* bar chart added for modern visualization */}
      <BarChart districts={districts} />
      <div className="fu3" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14, marginBottom:22 }}>
        {MODELS.map((m,i) => (
          <div key={m.name} onClick={() => setMi(i)} style={{ padding:"16px 18px", borderRadius:8, cursor:"pointer", transition:"all .2s", background:mi===i?"var(--grad-ai)":"var(--paper)", border:`2px solid ${mi===i?"var(--accent)":"var(--border)"}`, color:mi===i?"#ffffff":"var(--ink)" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
              <div style={{ fontWeight:600, fontSize:13 }}>{m.name}</div>
              {m.best && <span style={{ fontSize:9, padding:"2px 8px", borderRadius:20, background:"var(--amber)", color:"#fff", fontFamily:"var(--ff-mono)", fontWeight:600 }}>BEST</span>}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
              {[{l:"MAE",v:m.mae},{l:"RMSE",v:m.rmse},{l:"R²",v:m.r2,good:true}].map(s => (
                <div key={s.l}>
                  <div style={{ fontSize:8, fontFamily:"var(--ff-mono)", color:mi===i?"#8a7a64":"var(--muted)", letterSpacing:"1px", marginBottom:2 }}>{s.l}</div>
                  <div style={{ fontFamily:"var(--ff-head)", fontSize:18, fontWeight:900, color:(s as any).good?(m.r2>0.9?"var(--green-lt)":"var(--amber)"):mi===i?"#c8a97a":"var(--ink)" }}>{s.v}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="fu4" style={{ background:"var(--paper2)", border:"1px solid var(--border)", borderRadius:10, padding:"18px 22px", marginBottom:22 }}>
        <div style={{ fontFamily:"var(--ff-head)", fontSize:16, fontWeight:700, marginBottom:14 }}>10-Week Case Trend</div>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width:"100%", height:"auto", overflow:"visible" }}>
          <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--red)" stopOpacity=".2"/><stop offset="100%" stopColor="var(--red)" stopOpacity="0"/></linearGradient></defs>
          {[0,.25,.5,.75,1].map(t => <g key={t}><line x1={pL} y1={pT+(1-t)*(H-pT-pB)} x2={W-pR} y2={pT+(1-t)*(H-pT-pB)} stroke="var(--border)" strokeWidth=".8" strokeDasharray="3 3"/><text x={pL-4} y={pT+(1-t)*(H-pT-pB)+3} textAnchor="end" fontSize="8" fontFamily="var(--ff-mono)" fill="var(--muted)">{Math.round(maxC*t)}</text></g>)}
          <path d={ca} fill="url(#cg)"/>
          <path d={cp} fill="none" stroke="var(--red)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          {WEEKLY.map((d,i) => <g key={d.w}><circle cx={cx(i)} cy={cy(d.cases,maxC)} r="3.5" fill="var(--paper)" stroke="var(--red)" strokeWidth="2"/><text x={cx(i)} y={H-pB+14} textAnchor="middle" fontSize="8" fontFamily="var(--ff-mono)" fill="var(--muted)">{d.w}</text></g>)}
        </svg>
      </div>
      <div className="card" style={{ overflow:"hidden" }}>
        <div style={{ padding:"13px 20px", background:"var(--paper2)", borderBottom:"1px solid var(--border)" }}>
          <div style={{ fontFamily:"var(--ff-head)", fontSize:16, fontWeight:700 }}>District Capacity Forecast — {MODELS[mi].name}</div>
        </div>
        {loading ? <div style={{ padding:24 }}>{Array(5).fill(0).map((_,i)=><Skeleton key={i} h={40} mb={8}/>)}</div> : (
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr style={{ background:"var(--paper2)" }}>{["District","Risk","Avg Cases","Beds","ICU","Platelets","Util %"].map(h => <th key={h} style={{ padding:"9px 16px", textAlign:"left", fontSize:9, fontFamily:"var(--ff-mono)", letterSpacing:"1px", color:"var(--muted)", borderBottom:"1px solid var(--border)", fontWeight:500 }}>{h.toUpperCase()}</th>)}</tr></thead>
            <tbody>
              {[...districts].sort((a,b)=>b.avg_cases-a.avg_cases).map((d,i) => {
                const stress = stressNorm(d.stress_level);
                return (
                  <tr key={d.district} style={{ borderBottom:"1px solid var(--border)", background:i%2===0?"transparent":"var(--paper2)" }}>
                    <td style={{ padding:"11px 16px", fontWeight:600, fontSize:13 }}>{d.district}</td>
                    <td style={{ padding:"11px 16px", fontSize:10, fontFamily:"var(--ff-mono)", fontWeight:600, color:sc(stress) }}>{si(stress)} {stress}</td>
                    <td style={{ padding:"11px 16px", fontFamily:"var(--ff-mono)", fontSize:13 }}>{Math.round(d.avg_cases)}</td>
                    <td style={{ padding:"11px 16px", fontFamily:"var(--ff-mono)", fontSize:13, color:"var(--muted)" }}>{d.total_beds}</td>
                    <td style={{ padding:"11px 16px", fontFamily:"var(--ff-mono)", fontSize:13, color:"var(--muted)" }}>{d.icu_beds}</td>
                    <td style={{ padding:"11px 16px", fontFamily:"var(--ff-mono)", fontSize:13, color:d.platelet_stock<300?"var(--amber)":"var(--muted)" }}>{d.platelet_stock}{d.platelet_stock<300?" ⚠":""}</td>
                    <td style={{ padding:"11px 16px" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <div style={{ width:60, height:6, background:"var(--paper3)", borderRadius:3, overflow:"hidden" }}><div style={{ height:"100%", width:`${Math.min(d.cases_per_bed/8*100,100)}%`, background:sc(stress), borderRadius:3 }}/></div>
                        <span style={{ fontSize:11, fontFamily:"var(--ff-mono)", color:sc(stress), fontWeight:600 }}>{d.cases_per_bed}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Heatmap Tab ─────────────────────────────────────────────────────────────
function HeatmapTab({ districts, loading }: { districts:District[]; loading:boolean }) {
  const maxCases = Math.max(...districts.map(d => d.avg_cases), 1);
  return (
    <div style={{ padding:28, background:"linear-gradient(135deg,#000000,#130F40)" }}>
      <div className="fu" style={{ fontFamily:"var(--ff-head)", fontSize:26, fontWeight:900, marginBottom:6, color:"var(--ink)" }}>Case Heatmap</div>
      <div className="fu2" style={{ fontSize:11, fontFamily:"var(--ff-mono)", color:"var(--muted)", letterSpacing:".8px", marginBottom:22 }}>
        COLOUR INTENSITY IS PROPORTIONAL TO AVERAGE CASES PER DISTRICT
      </div>
      <div className="card" style={{ position:"relative", width:"100%", height:480, overflow:"hidden" }}>
        {loading ? (
          <div style={{ padding:24 }}><Skeleton h={40}/><Skeleton h={40}/><Skeleton h={40}/></div>
        ) : (
          <svg viewBox="60 120 460 320" style={{ width:"100%", height:"100%" }}>
            {districts.map(d => {
              const p = POS[d.district];
              if (!p) return null;
              const intensity = d.avg_cases / maxCases;
              const alpha = 0.2 + intensity * 0.6;
              const colour = `rgba(220,20,60,${alpha})`;
              return <circle key={d.district} cx={p.x} cy={p.y} r={20} fill={colour} />;
            })}
            <g transform="translate(75,400)">
              <rect x={0} y={0} width={80} height={12} fill="rgba(220,20,60,0.2)" />
              <rect x={0} y={0} width={80} height={12} fill="rgba(220,20,60,0.8)" />
              <text x={0} y={-4} fontSize="8" fontFamily="var(--ff-mono)" fill="var(--muted)">LOW</text>
              <text x={80} y={-4} textAnchor="end" fontSize="8" fontFamily="var(--ff-mono)" fill="var(--muted)">HIGH</text>
            </g>
          </svg>
        )}
      </div>
    </div>
  );
}

// ─── Inventory Tab ───────────────────────────────────────────────────────────
function InventoryTab({ districts, loading }: { districts:District[]; loading:boolean }) {
  return (
    <div style={{ padding:28, background:"linear-gradient(135deg,#000000,#130F40)" }}>
      <div className="fu" style={{ fontFamily:"var(--ff-head)", fontSize:26, fontWeight:900, marginBottom:6, color:"var(--ink)" }}>Data Inventory Map</div>
      <div className="fu2" style={{ fontSize:11, fontFamily:"var(--ff-mono)", color:"var(--muted)", letterSpacing:".8px", marginBottom:22 }}>
        SIZE OF CIRCLES INDICATES TOTAL BEDS; INNER RED DOT PROPORTIONATE TO ICU BEDS
      </div>
      <div className="card" style={{ position:"relative", width:"100%", height:480, overflow:"hidden" }}>
        {loading ? (
          <div style={{ padding:24 }}><Skeleton h={40}/><Skeleton h={40}/><Skeleton h={40}/></div>
        ) : (
          <svg viewBox="60 120 460 320" style={{ width:"100%", height:"100%" }}>
            {districts.map(d => {
              const p = POS[d.district];
              if (!p) return null;
              const outer = 10 + Math.sqrt(d.total_beds) * 0.4;
              const inner = outer * (d.icu_beds / Math.max(d.total_beds,1));
              return (
                <g key={d.district}>
                  <circle cx={p.x} cy={p.y} r={outer} fill="var(--amber)" opacity=".3" />
                  <circle cx={p.x} cy={p.y} r={inner} fill="var(--red)" opacity=".5" />
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
}

// ─── Risk Card Tab ──────────────────────────────────────────────────────────
function RiskCardTab({ districts, loading }: { districts:District[]; loading:boolean }) {
  return (
    <div style={{ padding:28, background:"linear-gradient(135deg,#000000,#130F40)" }}>
      <div className="fu" style={{ fontFamily:"var(--ff-head)", fontSize:26, fontWeight:900, marginBottom:6, color:"var(--ink)" }}>Risk Score Cards</div>
      <div className="fu2" style={{ fontSize:11, fontFamily:"var(--ff-mono)", color:"var(--muted)", letterSpacing:".8px", marginBottom:22 }}>
        SORTED BY RISK SCORE WITH KEY METRICS
      </div>
      {loading ? (
        <div><Skeleton h={40}/><Skeleton h={40}/><Skeleton h={40}/></div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))", gap:16 }}>
          {[...districts].sort((a,b)=>riskScore(b)-riskScore(a)).map(d => {
            const stress = stressNorm(d.stress_level);
            const risk = riskScore(d);
            return (
              <div key={d.district} className="card" style={{ padding:16, position:"relative", borderLeft:`4px solid ${sc(stress)}`, background:`linear-gradient(135deg,var(--paper),${sc(stress)}08)` }}>
                <div style={{ fontSize:16, fontWeight:700 }}>{d.district}</div>
                <div style={{ fontSize:11, fontFamily:"var(--ff-mono)", color:sc(stress), marginTop:4 }}>{si(stress)} {stress}</div>
                <div style={{ marginTop:8, fontSize:14, fontWeight:900 }}>Risk {risk}/100</div>
                <div style={{ fontSize:10, fontFamily:"var(--ff-mono)", color:"var(--muted)", marginTop:4 }}>Avg {Math.round(d.avg_cases)} · Util {d.cases_per_bed}%</div>
                <div style={{ position:"absolute", top:8, right:8, width:12, height:12, borderRadius:"50%", background:sc(stress) }} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── AI Briefing ──────────────────────────────────────────────────────────────
function AIBriefing({ pipelineStatus }: { pipelineStatus: any }) {
  const WELCOME_MESSAGE: Message = {
    role:"ai",
    text:"Good day, Officer.\n\nI am SurgeShield AI, your dengue outbreak command assistant. I have access to real-time hospital capacity data, ML-generated forecasts, and can trigger full pipeline analyses via the SageMaker pipeline.\n\nHow may I assist you today?",
    time:new Date(),
  };

  const [msgs, setMsgs] = useState<Message[]>([]);
  const [input, setInput]     = useState("");
  const [busy, setBusy]       = useState(false);
  const [sessionId, setSessionId] = useState<string|null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Initialize from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("surgeshield_chat_history");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setMsgs(parsed.map((m: any) => ({ ...m, time: new Date(m.time) })));
        const storedSessionId = localStorage.getItem("surgeshield_session_id");
        if (storedSessionId) setSessionId(storedSessionId);
      } catch {
        setMsgs([WELCOME_MESSAGE]);
      }
    } else {
      setMsgs([WELCOME_MESSAGE]);
    }
  }, []);

  // Persist to localStorage whenever msgs changes
  useEffect(() => {
    if (msgs.length > 0) {
      localStorage.setItem("surgeshield_chat_history", JSON.stringify(msgs));
    }
  }, [msgs]);

  // Persist sessionId to localStorage
  useEffect(() => {
    if (sessionId) {
      localStorage.setItem("surgeshield_session_id", sessionId);
    }
  }, [sessionId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior:"smooth" }); }, [msgs]);

  const send = useCallback(async (text?: string) => {
    const q = (text || input).trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    setMsgs(m => [...m, { role:"user", text:q, time:new Date() }]);

    try {
      const res  = await fetch("/api/agent", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ message:q, sessionId }) });
      const data = await res.json();
      if (data.sessionId) setSessionId(data.sessionId);
      setMsgs(m => [...m, { role:"ai", text:data.response || data.error || "No response.", time:new Date() }]);
    } catch {
      setMsgs(m => [...m, { role:"ai", text:"Connection error. Please check your Bedrock Agent configuration.", time:new Date() }]);
    } finally {
      setBusy(false);
    }
  }, [input, busy, sessionId]);

  const tStr = (t:Date) => t.toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit" });

  const renderText = (text:string) =>
    text.split("\n").map((line,li) => (
      <div key={li} style={{ marginBottom:line===""?4:0 }}>
        {line.split(/(\*\*[^*]+\*\*)/).map((part,pi) =>
          part.startsWith("**") ? <strong key={pi} style={{ fontWeight:700 }}>{part.slice(2,-2)}</strong> : part
        )}
      </div>
    ));

  const lastRun = pipelineStatus?.generated_at ? new Date(pipelineStatus.generated_at).toLocaleString("en-IN",{timeStyle:"short",dateStyle:"short"}) : "Never";

  return (
    <div style={{ display:"flex", height:"calc(100vh - 110px)", background:"#ffffff" }}>
      {/* Sidebar */}
    <div style={{ width:240, borderRight:"1px solid var(--border)", background:"linear-gradient(180deg,var(--paper),var(--paper2))", flexShrink:0, overflowY:"auto" }}>
        <div style={{ padding:"16px 16px 10px", borderBottom:"1px solid var(--border)" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <div style={{ fontSize:9, fontFamily:"var(--ff-mono)", color:"var(--muted)", letterSpacing:"1.5px" }}>QUICK BRIEFINGS</div>
            <button 
              onClick={() => {
                setMsgs([{
                  role:"ai",
                  text:"Good day, Officer.\n\nI am SurgeShield AI, your dengue outbreak command assistant. I have access to real-time hospital capacity data, ML-generated forecasts, and can trigger full pipeline analyses via the SageMaker pipeline.\n\nHow may I assist you today?",
                  time:new Date(),
                }]);
                localStorage.removeItem("surgeshield_chat_history");
                localStorage.removeItem("surgeshield_session_id");
                setSessionId(null);
              }}
              style={{ fontSize:8, fontFamily:"var(--ff-mono)", background:"none", border:"1px solid var(--border)", borderRadius:4, padding:"4px 8px", cursor:"pointer", color:"var(--muted)", transition:"all .2s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor="var(--red)"; (e.currentTarget as HTMLButtonElement).style.color="var(--red)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor="var(--border)"; (e.currentTarget as HTMLButtonElement).style.color="var(--muted)"; }}
            >
              CLEAR
            </button>
          </div>
          {STARTERS.map((s,i) => (
            <button key={i} onClick={() => send(s)} style={{ display:"block", width:"100%", textAlign:"left", background:"none", border:"1px solid var(--border)", borderRadius:6, padding:"9px 12px", marginBottom:6, fontSize:11, fontFamily:"var(--ff-body)", color:"var(--ink)", cursor:"pointer", transition:"all .2s", lineHeight:1.4 }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background="var(--grad-ai)"; (e.currentTarget as HTMLButtonElement).style.color="#ffffff"; (e.currentTarget as HTMLButtonElement).style.borderColor="var(--accent)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background="none"; (e.currentTarget as HTMLButtonElement).style.color="var(--ink)"; (e.currentTarget as HTMLButtonElement).style.borderColor="var(--border)"; }}
            >{s}</button>
          ))}
        </div>
        <div style={{ padding:"14px 16px" }}>
          <div style={{ fontSize:9, fontFamily:"var(--ff-mono)", color:"var(--muted)", letterSpacing:"1.5px", marginBottom:10 }}>SYSTEM STATUS</div>
          {[
            { l:"Bedrock Agent",  s:pipelineStatus?.error ? "Connection Failed" : pipelineStatus?.connected?"Online":"Checking...", ok:!pipelineStatus?.error && !!pipelineStatus?.connected },
            { l:"S3 Data Bucket", s:pipelineStatus?.error ? "Connection Failed" : pipelineStatus?.connected?"Connected":"Checking...", ok:!pipelineStatus?.error && !!pipelineStatus?.connected },
            { l:"Last Pipeline",  s:pipelineStatus?.message || (pipelineStatus?.generated_at ? new Date(pipelineStatus.generated_at).toLocaleTimeString("en-IN",{timeStyle:"short"}) : "Never"), ok:!!pipelineStatus?.success },
            { l:"Model",          s:pipelineStatus?.model || "Claude 3.5 Sonnet", ok:true },
          ].map(item => (
            <div key={item.l} style={{ display:"flex", justifyContent:"space-between", fontSize:10, fontFamily:"var(--ff-mono)", marginBottom:8 }}>
              <span style={{ color:"var(--muted)" }}>{item.l}</span>
              <span style={{ color:item.ok?"var(--green-lt)":"var(--amber)", display:"flex", alignItems:"center", gap:4 }}>
                <span style={{ width:5, height:5, borderRadius:"50%", background:item.ok?"var(--green-lt)":"var(--amber)", display:"inline-block" }}/>
                {item.s}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Chat */}
      <div style={{ flex:1, display:"flex", flexDirection:"column" }}>
        <div style={{ flex:1, overflowY:"auto", padding:"24px 32px", display:"flex", flexDirection:"column", gap:18 }}>
          {msgs.map((m,i) => (
            <div key={i} style={{ display:"flex", flexDirection:"column", alignItems:m.role==="user"?"flex-end":"flex-start", animation:"fadeUp .3s ease both" }}>
              <div style={{ fontSize:9, fontFamily:"var(--ff-mono)", color:m.role==="user"?"var(--muted)":"var(--amber)", letterSpacing:"1.5px", marginBottom:5, fontWeight:600 }}>{m.role==="user"?"DISTRICT OFFICER":"⚡ SURGESHIELD AI"}</div>
          <div style={{ maxWidth:580, padding:"14px 18px", borderRadius:m.role==="user"?"12px 12px 3px 12px":"3px 12px 12px 12px", background:m.role==="user"?"var(--grad-ai)":"var(--paper)", border:`1px solid ${m.role==="user"?"var(--accent)":"var(--border)"}`, fontSize:12, fontFamily:"var(--ff-body)", lineHeight:1.8, color:m.role==="user"?"#ffffff":"var(--ink)", boxShadow:"0 4px 12px var(--shadow)" }}>
                {renderText(m.text)}
              </div>
              <div style={{ fontSize:9, fontFamily:"var(--ff-mono)", color:"var(--muted)", marginTop:4 }}>{tStr(m.time)}</div>
            </div>
          ))}
          {busy && (
            <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-start" }}>
              <div style={{ fontSize:9, fontFamily:"var(--ff-mono)", color:"var(--amber)", letterSpacing:"1.5px", marginBottom:5, fontWeight:600 }}>⚡ SURGESHIELD AI</div>
            <div style={{ padding:"14px 18px", background:"var(--paper2)", border:"1px solid var(--border)", borderRadius:"3px 12px 12px 12px", display:"flex", alignItems:"center", gap:5 }}>
                {[0,1,2].map(i => <div key={i} style={{ width:7, height:7, borderRadius:"50%", background:"var(--amber)", animation:`dotBlink 1.4s ${i*.2}s infinite` }}/>)}
              </div>
            </div>
          )}
          <div ref={endRef}/>
        </div>
        <div style={{ borderTop:"1px solid var(--border)", padding:"14px 32px 20px", background:"var(--paper)" }}>
          <div style={{ display:"flex", gap:10, border:"1px solid var(--border-dk)", borderRadius:8, padding:"4px 4px 4px 18px", background:"var(--paper2)", transition:"border-color .2s" }}
            onFocus={e => (e.currentTarget as HTMLDivElement).style.borderColor="var(--accent)"}
            onBlur={e  => (e.currentTarget as HTMLDivElement).style.borderColor="var(--border)"}
          >
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key==="Enter" && send()}
              placeholder="Request a district briefing, capacity report, or trigger pipeline..."
              style={{ flex:1, background:"none", border:"none", outline:"none", color:"var(--ink)", fontSize:13, fontFamily:"var(--ff-body)", padding:"10px 0" }}
            />
            <button onClick={() => send()} disabled={busy||!input.trim()} style={{ background:input.trim()&&!busy?"var(--ink)":"var(--paper3)", border:"none", borderRadius:6, padding:"10px 22px", color:input.trim()&&!busy?"var(--paper)":"var(--muted)", fontSize:11, fontFamily:"var(--ff-mono)", fontWeight:600, letterSpacing:"1px", cursor:input.trim()&&!busy?"pointer":"default", transition:"all .2s" }}>SEND</button>
          </div>
          <div style={{ fontSize:9, fontFamily:"var(--ff-mono)", color:"var(--muted)", marginTop:7, letterSpacing:".5px" }}>
            Connected to AWS Bedrock Agent · {process.env.NEXT_PUBLIC_AWS_REGION || "us-east-1"} · Agent ID: {process.env.NEXT_PUBLIC_AGENT_ID || "534E9HOLQC"}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab]             = useState("Situation Map");
  const [districts, setDistricts] = useState<District[]>(MOCK_DISTRICTS);
  const [loading, setLoading]     = useState(true);
  const [pipelineStatus, setPipelineStatus] = useState<any>(null);

  // Load live data on mount
  useEffect(() => {
    Promise.all([
      fetch("/api/capacity").then(r => r.json()).catch(() => null),
      fetch("/api/status").then(r => r.json()).catch(() => null),
    ]).then(([cap, status]) => {
      if (cap?.districts?.length) setDistricts(cap.districts);
      if (status) setPipelineStatus(status);
      setLoading(false);
    });
  }, []);

  // Refresh data every 5 minutes
  useEffect(() => {
    const t = setInterval(() => {
      fetch("/api/capacity").then(r => r.json()).then(cap => {
        if (cap?.districts?.length) setDistricts(cap.districts);
      }).catch(() => {});
    }, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <>
      <style>{STYLES}</style>
      <Ticker districts={districts}/>
      <TopBar tab={tab} setTab={setTab} lastRun={pipelineStatus?.generated_at ?? null}/>
      {tab==="Situation Map" && <SituationMap districts={districts} loading={loading}/>}
      {tab==="Heatmap"       && <HeatmapTab districts={districts} loading={loading}/>}
      {tab==="Inventory"     && <InventoryTab districts={districts} loading={loading}/>}
      {tab==="Risk Card"     && <RiskCardTab districts={districts} loading={loading}/>}
      {tab==="Capacity"      && <CapacityTab  districts={districts} loading={loading}/>}
      {tab==="Predictions"   && <PredictionsTab districts={districts} loading={loading}/>}
      {tab==="AI Briefing"   && <AIBriefing pipelineStatus={pipelineStatus}/>}
    </>
  );
}

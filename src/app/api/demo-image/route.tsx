import { ImageResponse } from "next/og";

export const dynamic = "force-dynamic";

const ink = "#171717";
const muted = "#6b7280";
const line = "#e5e7eb";
const green = "#047857";
const greenSoft = "#ecfdf5";

function Icon({ children, active = false }: { children: string; active?: boolean }) {
  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        borderRadius: 8,
        background: active ? "#262626" : "transparent",
        color: active ? "#ffffff" : "#737373",
        fontSize: 14,
      }}
    >
      {children}
    </span>
  );
}

function Card({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        border: `1px solid ${line}`,
        borderRadius: 14,
        background: "#ffffff",
        boxShadow: "0 1px 2px rgba(0,0,0,0.025)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card style={{ width: 249, height: 124, padding: "19px 20px" }}>
      <span style={{ display: "flex", color: muted, fontSize: 12 }}>{label}</span>
      <span style={{ display: "flex", marginTop: 10, color: ink, fontSize: 26, fontWeight: 650 }}>{value}</span>
      <span style={{ display: "flex", marginTop: 5, color: muted, fontSize: 12 }}>{hint}</span>
    </Card>
  );
}

function Candidate({ rank, name, detail, status }: { rank: string; name: string; detail: string; status?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", height: 39, borderTop: `1px solid ${line}`, fontSize: 13 }}>
      <span style={{ display: "flex", width: 24, color: "#9ca3af" }}>{rank}.</span>
      <span style={{ display: "flex", width: 72, color: ink, fontWeight: 600 }}>{name}</span>
      <span style={{ display: "flex", flex: 1, color: muted }}>{detail}</span>
      {status && (
        <span style={{ display: "flex", padding: "4px 10px", border: `1px solid ${line}`, borderRadius: 999, color: status === "accepted" ? green : muted, fontSize: 11 }}>
          {status}
        </span>
      )}
    </div>
  );
}

function CheckStep({ title, detail }: { title: string; detail: string }) {
  return (
    <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
      <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: 999, background: "#d1fae5", color: green, fontSize: 10, fontWeight: 700 }}>OK</span>
      <div style={{ display: "flex", flexDirection: "column", width: 230 }}>
        <span style={{ display: "flex", color: ink, fontSize: 13, fontWeight: 600 }}>{title}</span>
        <span style={{ display: "flex", marginTop: 4, color: muted, fontSize: 11, lineHeight: 1.45 }}>{detail}</span>
      </div>
    </div>
  );
}

function Verification({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", width: 315, height: 68, padding: "0 16px", border: `1px solid ${line}`, borderRadius: 11, background: "#fafafa" }}>
      <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, marginRight: 12, borderRadius: 999, background: greenSoft, color: green, fontSize: 10, fontWeight: 700 }}>OK</span>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ display: "flex", color: muted, fontSize: 11 }}>{label}</span>
        <span style={{ display: "flex", marginTop: 4, color: ink, fontSize: 13, fontWeight: 600 }}>{value}</span>
      </div>
    </div>
  );
}

export async function GET() {
  return new ImageResponse(
    <div style={{ display: "flex", width: 1440, height: 960, background: "#f8f8f8", color: ink, fontFamily: "Arial, sans-serif" }}>
      <aside style={{ display: "flex", flexDirection: "column", width: 224, height: 960, padding: "28px 20px", borderRight: `1px solid ${line}`, background: "#ffffff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 8px" }}>
          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 11, background: "#262626", color: "#ffffff", fontSize: 11, fontWeight: 700 }}>SP</span>
          <span style={{ display: "flex", fontSize: 18, fontWeight: 650, letterSpacing: -0.4 }}>ShiftPilot</span>
        </div>
        <span style={{ display: "flex", margin: "39px 14px 12px", color: "#9ca3af", fontSize: 10, fontWeight: 600, letterSpacing: 1.7 }}>WORKSPACE</span>
        {[["O", "Overview", true], ["S", "Schedule", false], ["T", "Team", false], ["A", "Activity", false], ["G", "Settings", false]].map(([symbol, label, active]) => (
          <div key={String(label)} style={{ display: "flex", alignItems: "center", gap: 10, height: 43, marginBottom: 4, padding: "0 11px", borderRadius: 11, background: active ? "#f5f5f5" : "transparent", color: active ? ink : "#737373", fontSize: 13, fontWeight: active ? 600 : 400 }}>
            <Icon active={false}>{String(symbol)}</Icon>{String(label)}
          </div>
        ))}
        <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", paddingTop: 18, borderTop: `1px solid ${line}` }}>
          <span style={{ display: "flex", color: ink, fontSize: 13, fontWeight: 600 }}>Kopi &amp; Co. Café</span>
          <span style={{ display: "flex", marginTop: 7, color: muted, fontSize: 11 }}>3 active outlets</span>
        </div>
      </aside>

      <main style={{ display: "flex", flexDirection: "column", width: 1216, height: 960, padding: "38px 42px" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ display: "flex", color: muted, fontSize: 13 }}>Kopi &amp; Co. Café</span>
            <span style={{ display: "flex", marginTop: 8, color: ink, fontSize: 31, fontWeight: 600, letterSpacing: -0.9 }}>Your week, at a glance</span>
            <span style={{ display: "flex", marginTop: 9, color: muted, fontSize: 13 }}>One staffing change is being handled across your outlets.</span>
          </div>
          <span style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 13px", border: "1px solid #bbf7d0", borderRadius: 999, background: "#ffffff", color: green, fontSize: 12 }}>OK&nbsp; Latest actions verified</span>
        </header>

        <section style={{ display: "flex", gap: 12, marginTop: 25 }}>
          <Metric label="Needs approval" value="0" hint="You’re all caught up" />
          <Metric label="Shift coverage" value="42/42" hint="Places filled this week" />
          <Metric label="Outlets protected" value="3/3" hint="Minimum roles maintained" />
          <Metric label="Verified actions" value="14" hint="Roster and messages checked" />
        </section>

        <section style={{ display: "flex", gap: 18, marginTop: 18 }}>
          <Card style={{ width: 726, height: 405, padding: "22px 24px" }}>
            <span style={{ display: "flex", color: ink, fontSize: 15, fontWeight: 650 }}>CHG&nbsp;&nbsp;Changes during the week</span>
            <span style={{ display: "flex", marginTop: 7, color: muted, fontSize: 12 }}>Sick calls and drop-outs the agent is handling.</span>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 18, padding: "17px 18px", border: `1px solid ${line}`, borderRadius: 11 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ display: "flex", color: ink, fontSize: 14, fontWeight: 650 }}>Friday Closing · 16:00–21:00</span>
                  <span style={{ display: "flex", marginTop: 6, color: muted, fontSize: 12 }}>@&nbsp; Orchard outlet</span>
                </div>
                <span style={{ display: "flex", alignItems: "center", height: 25, padding: "0 11px", borderRadius: 999, background: "#262626", color: "#ffffff", fontSize: 11 }}>covered</span>
              </div>
              <span style={{ display: "flex", margin: "15px 0 8px", color: muted, fontSize: 12 }}>Aisha reported sick · health details private</span>
              <Candidate rank="1" name="Daniel" detail="available · food-safety trained · 18h of 30h" status="accepted" />
              <Candidate rank="2" name="Marcus" detail="declined · 20h of 30h" status="declined" />
              <Candidate rank="3" name="Mei" detail="available from 19:00 · Tampines outlet" />
              <div style={{ display: "flex", alignItems: "center", height: 47, marginTop: 13, padding: "0 13px", border: "1px solid #a7f3d0", borderRadius: 9, background: greenSoft, color: "#065f46", fontSize: 11 }}>
                <span style={{ display: "flex", marginRight: 9, fontSize: 11, fontWeight: 700 }}>OK</span>
                <span style={{ display: "flex", marginRight: 8, fontWeight: 650 }}>Execution verified</span>
                <span style={{ display: "flex" }}>Roster updated · confirmation delivered · outlet rules passed</span>
              </div>
            </div>
          </Card>

          <Card style={{ width: 330, height: 405, padding: "22px 24px" }}>
            <span style={{ display: "flex", color: ink, fontSize: 15, fontWeight: 650 }}>REC&nbsp;&nbsp;Recovery status</span>
            <span style={{ display: "flex", marginTop: 7, color: muted, fontSize: 12 }}>Every change is checked after execution.</span>
            <CheckStep title="Absence detected" detail="Aisha reported sick for Friday closing at Orchard." />
            <CheckStep title="Replacement confirmed" detail="Daniel accepted after Marcus declined." />
            <CheckStep title="Execution verified" detail="Roster read back and message delivery recorded." />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 37, marginTop: 17, border: `1px solid ${line}`, borderRadius: 8, color: ink, fontSize: 12, fontWeight: 600 }}>Show live state change</div>
          </Card>
        </section>

        <Card style={{ height: 166, marginTop: 18, padding: "20px 24px" }}>
          <span style={{ display: "flex", color: ink, fontSize: 15, fontWeight: 650 }}>LOG&nbsp;&nbsp;Latest verification</span>
          <span style={{ display: "flex", marginTop: 6, color: muted, fontSize: 12 }}>Observed results are recorded after the agent acts.</span>
          <div style={{ display: "flex", gap: 12, marginTop: 15 }}>
            <Verification label="Roster database" value="42 active assignments" />
            <Verification label="Outlet policy" value="3 of 3 outlets protected" />
            <Verification label="WhatsApp" value="Message delivered" />
          </div>
        </Card>
      </main>
    </div>,
    { width: 1440, height: 960 },
  );
}

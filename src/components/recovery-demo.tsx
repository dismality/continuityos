"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Bot,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Download,
  ExternalLink,
  FileCheck2,
  House,
  Mail,
  MapPin,
  MessageSquare,
  MessagesSquare,
  Navigation,
  Phone,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Table2,
  Trash2,
  Users,
  Utensils,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Stage = "detected" | "planning" | "negotiating" | "approval" | "executing" | "resolved";
type PlanId = "A" | "B" | "C";
type AssignmentSource = "original" | "manual" | "ai";
type ContactChannel = "WhatsApp" | "Telegram" | "SMS";
type WorkerDecision = "Pending" | "Working" | "Unavailable" | "Human requested";

type WorkerContact = {
  name: string;
  role: string;
  outlet: string;
  status: "Working" | "Available" | "Awaiting reply" | "Unavailable";
  channels: ContactChannel[];
  preferred: ContactChannel;
};

type ChatMessage = {
  id: number;
  body: string;
  direction: "outgoing" | "incoming" | "system";
  sender: "AI" | "Manager" | "Worker" | "System";
  channel: ContactChannel;
  at: string;
};

type HourlyAssignment = {
  name: string;
  source: AssignmentSource;
};

type TimetableRow = {
  id: number;
  time: string;
  demand: "Low" | "Build-up" | "Moderate" | "High" | "Peak" | "Close";
  required: number;
  assignments: HourlyAssignment[];
};

type AuditEntry = {
  at: string;
  tool: string;
  action: string;
  evidence: string;
  status: "verified" | "waiting" | "approval";
};

const goal = "Keep Orchard and Tampines operating tonight, protect every reservation, use qualified workers only, keep added cost below S$150 and distribute overtime fairly.";

const outlet = {
  name: "Orchard outlet",
  address: "391 Orchard Road, Singapore 238872",
  serviceDate: "Friday, 16 October 2026",
  serviceWindow: "Dinner · 16:00–22:00",
  nearby: "Tampines outlet · 31 min",
};

const originalRoster = [
  { name: "Aisha", role: "Closing lead", shift: "16:00–22:00", qualification: "Food safety · Keyholder", status: "Unavailable", reason: "Sick leave · details private" },
  { name: "Ben", role: "Service crew", shift: "17:00–22:00", qualification: "Service trained", status: "Unavailable", reason: "Personal emergency · details private" },
  { name: "Chloe", role: "Cashier", shift: "16:00–21:00", qualification: "POS trained", status: "Working", reason: "Confirmed" },
  { name: "Raj", role: "Kitchen crew", shift: "15:00–22:00", qualification: "Food safety", status: "Working", reason: "Confirmed" },
];

const workerOptions = ["Chloe", "Raj", "Nina", "Leon", "Farah", "Daniel", "Marcus", "Mei"];

const workerDirectory: WorkerContact[] = [
  { name: "Aisha", role: "Closing lead", outlet: "Orchard", status: "Unavailable", channels: ["WhatsApp", "SMS"], preferred: "WhatsApp" },
  { name: "Ben", role: "Service crew", outlet: "Orchard", status: "Unavailable", channels: ["Telegram", "SMS"], preferred: "Telegram" },
  { name: "Chloe", role: "Cashier", outlet: "Orchard", status: "Working", channels: ["WhatsApp", "Telegram"], preferred: "WhatsApp" },
  { name: "Raj", role: "Kitchen crew", outlet: "Orchard", status: "Working", channels: ["WhatsApp", "SMS"], preferred: "WhatsApp" },
  { name: "Nina", role: "Kitchen crew", outlet: "Orchard", status: "Working", channels: ["Telegram", "WhatsApp"], preferred: "Telegram" },
  { name: "Leon", role: "Service crew", outlet: "Orchard", status: "Working", channels: ["SMS", "WhatsApp"], preferred: "SMS" },
  { name: "Farah", role: "Service crew", outlet: "Orchard", status: "Working", channels: ["WhatsApp", "Telegram"], preferred: "WhatsApp" },
  { name: "Daniel", role: "Food-safety lead", outlet: "Somerset", status: "Available", channels: ["WhatsApp", "Telegram"], preferred: "WhatsApp" },
  { name: "Marcus", role: "Food-safety lead", outlet: "Bugis", status: "Awaiting reply", channels: ["Telegram", "WhatsApp"], preferred: "Telegram" },
  { name: "Mei", role: "Service crew", outlet: "Tampines", status: "Available", channels: ["Telegram", "WhatsApp"], preferred: "Telegram" },
];

const channelAppUrls: Record<ContactChannel, string> = {
  WhatsApp: "https://web.whatsapp.com/",
  Telegram: "https://web.telegram.org/",
  SMS: "https://messages.google.com/web/",
};

const initialWorkerChats: Record<string, ChatMessage[]> = {
  Daniel: [{ id: 1, body: "Hi Daniel — this is the ContinuityOS assistant for Kopi & Co. Can you cover the Orchard closing-lead shift today, 16:00–22:00?", direction: "outgoing", sender: "AI", channel: "WhatsApp", at: "17:02" }],
};

const initialTimetable: TimetableRow[] = [
  { id: 1, time: "15:00", demand: "Build-up", required: 2, assignments: [{ name: "Raj", source: "original" }, { name: "Nina", source: "original" }] },
  { id: 2, time: "16:00", demand: "Moderate", required: 4, assignments: [{ name: "Chloe", source: "original" }, { name: "Raj", source: "original" }, { name: "Nina", source: "original" }] },
  { id: 3, time: "17:00", demand: "High", required: 6, assignments: [{ name: "Chloe", source: "original" }, { name: "Raj", source: "original" }, { name: "Nina", source: "original" }, { name: "Leon", source: "original" }] },
  { id: 4, time: "18:00", demand: "Peak", required: 7, assignments: [{ name: "Chloe", source: "original" }, { name: "Raj", source: "original" }, { name: "Nina", source: "original" }, { name: "Leon", source: "original" }, { name: "Farah", source: "original" }] },
  { id: 5, time: "19:00", demand: "Peak", required: 8, assignments: [{ name: "Chloe", source: "original" }, { name: "Raj", source: "original" }, { name: "Nina", source: "original" }, { name: "Leon", source: "original" }, { name: "Farah", source: "original" }] },
  { id: 6, time: "20:00", demand: "High", required: 7, assignments: [{ name: "Chloe", source: "original" }, { name: "Raj", source: "original" }, { name: "Nina", source: "original" }, { name: "Leon", source: "original" }, { name: "Farah", source: "original" }] },
  { id: 7, time: "21:00", demand: "Moderate", required: 5, assignments: [{ name: "Raj", source: "original" }, { name: "Nina", source: "original" }, { name: "Leon", source: "original" }, { name: "Farah", source: "original" }] },
  { id: 8, time: "22:00", demand: "Close", required: 3, assignments: [{ name: "Raj", source: "original" }, { name: "Nina", source: "original" }] },
];

const plans: Array<{
  id: PlanId;
  name: string;
  description: string;
  cost: number;
  protected: number;
  affected: number;
  fairness: string;
  recommended?: boolean;
}> = [
  {
    id: "A",
    name: "Cross-outlet recovery",
    description: "Move Daniel to Orchard and extend Mei's shift by two hours. Rebalance one Tampines role.",
    cost: 124,
    protected: 42,
    affected: 0,
    fairness: "No worker exceeds 28h",
    recommended: true,
  },
  {
    id: "B",
    name: "Reduce delivery capacity",
    description: "Move Daniel to Orchard and pause new delivery orders between 19:00 and 20:30.",
    cost: 61,
    protected: 42,
    affected: 11,
    fairness: "Lowest labour cost",
  },
  {
    id: "C",
    name: "Consolidate service",
    description: "Close the Orchard terrace section and move seven bookings indoors or to Tampines.",
    cost: 20,
    protected: 35,
    affected: 7,
    fairness: "No overtime required",
  },
];

const stages: Stage[] = ["detected", "planning", "negotiating", "approval", "executing", "resolved"];

const baseAudit: AuditEntry[] = [
  {
    at: "17:02:08",
    tool: "Workforce DB",
    action: "Absence detected for Aisha and Ben",
    evidence: "INC-2407 · two required roles released",
    status: "verified",
  },
  {
    at: "17:02:10",
    tool: "Bookings",
    action: "Assessed customer impact",
    evidence: "42 reservations · S$5,800 revenue at risk",
    status: "verified",
  },
];

export function RecoveryDemo() {
  const [stage, setStage] = useState<Stage>("detected");
  const [selectedPlan, setSelectedPlan] = useState<PlanId>("A");
  const [surpriseIntroduced, setSurpriseIntroduced] = useState(false);
  const [audit, setAudit] = useState<AuditEntry[]>(baseAudit);
  const [activeView, setActiveView] = useState("Incident overview");
  const [contactedWorkers, setContactedWorkers] = useState<Record<string, boolean>>({});
  const [timetable, setTimetable] = useState<TimetableRow[]>(initialTimetable);
  const [aiScheduleApplied, setAiScheduleApplied] = useState(false);
  const [selectedWorkerName, setSelectedWorkerName] = useState("Daniel");
  const [selectedChannel, setSelectedChannel] = useState<ContactChannel>("WhatsApp");
  const [messageDraft, setMessageDraft] = useState("");
  const [aiAutoChat, setAiAutoChat] = useState(true);
  const [humanTakeover, setHumanTakeover] = useState<Record<string, boolean>>({});
  const [workerDecisions, setWorkerDecisions] = useState<Record<string, WorkerDecision>>({});
  const [workerChats, setWorkerChats] = useState<Record<string, ChatMessage[]>>(initialWorkerChats);

  const stageIndex = stages.indexOf(stage);
  const chosenPlan = plans.find((plan) => plan.id === selectedPlan) ?? plans[0];
  const isResolved = stage === "resolved";
  const needsApproval = stage === "approval";
  const selectedWorker = workerDirectory.find((worker) => worker.name === selectedWorkerName) ?? workerDirectory[0];
  const selectedMessages = workerChats[selectedWorkerName] ?? [];
  const selectedDecision = workerDecisions[selectedWorkerName] ?? "Pending";

  const metrics = useMemo(() => ({
    coverage: isResolved ? "18/18" : stageIndex >= 3 ? "16/18" : "14/18",
    approval: needsApproval ? "1" : "0",
    revenue: isResolved ? "S$5,800" : "S$0",
    actions: audit.filter((entry) => entry.status === "verified").length,
  }), [audit, isResolved, needsApproval, stageIndex]);

  function appendAudit(entry: AuditEntry) {
    setAudit((current) => [...current, entry]);
  }

  function navigateTo(label: string, sectionId: string) {
    setActiveView(label);
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function createMessage(workerName: string, message: Omit<ChatMessage, "id">) {
    setWorkerChats((current) => {
      const messages = current[workerName] ?? [];
      return { ...current, [workerName]: [...messages, { ...message, id: messages.length + 1 }] };
    });
  }

  function startAiConversation(worker: WorkerContact) {
    if ((workerChats[worker.name]?.length ?? 0) > 0 || worker.status === "Unavailable") return;
    createMessage(worker.name, {
      body: `Hi ${worker.name} — this is the ContinuityOS assistant for Kopi & Co. Are you available to help at the ${outlet.name} today?`,
      direction: "outgoing",
      sender: "AI",
      channel: worker.preferred,
      at: "17:04",
    });
    appendAudit({
      at: "17:04:12",
      tool: `${worker.preferred} Sandbox API`,
      action: `AI opened a shift conversation with ${worker.name}`,
      evidence: "Automated opening message · yes/no/human quick replies enabled",
      status: "verified",
    });
  }

  function selectWorkerContact(worker: WorkerContact) {
    setSelectedWorkerName(worker.name);
    setSelectedChannel(worker.preferred);
    if (aiAutoChat) startAiConversation(worker);
  }

  function toggleAiConversation() {
    const nextValue = !aiAutoChat;
    setAiAutoChat(nextValue);
    if (nextValue) startAiConversation(selectedWorker);
  }

  function sendConversationMessage() {
    const body = messageDraft.trim();
    if (!body) return;
    const isHuman = humanTakeover[selectedWorkerName] || !aiAutoChat;
    createMessage(selectedWorkerName, {
      body,
      direction: "outgoing",
      sender: isHuman ? "Manager" : "AI",
      channel: selectedChannel,
      at: "17:05",
    });
    setMessageDraft("");
    appendAudit({
      at: "17:05:03",
      tool: `${selectedChannel} Sandbox API`,
      action: `${isHuman ? "Manager" : "AI"} sent a message to ${selectedWorkerName}`,
      evidence: `Sandbox delivery receipt ${selectedChannel.slice(0, 2).toUpperCase()}-${9100 + selectedMessages.length}`,
      status: "verified",
    });
  }

  function assignAcceptedWorker(name: string) {
    const acceptedHours: Record<string, string[]> = {
      Daniel: ["16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00"],
      Mei: ["19:00", "20:00"],
      Marcus: ["17:00", "18:00", "19:00", "20:00", "21:00", "22:00"],
    };
    const hours = acceptedHours[name] ?? [];
    if (hours.length === 0) return;
    setTimetable((current) => current.map((row) => {
      if (!hours.includes(row.time) || row.assignments.some((assignment) => assignment.name === name)) return row;
      return { ...row, assignments: [...row.assignments, { name, source: "ai" }] };
    }));
    setAiScheduleApplied(true);
    appendAudit({
      at: "17:05:10",
      tool: "AI timetable",
      action: `Added ${name} after a verified “Yes, I can work” reply`,
      evidence: `${hours.length} hourly cells updated · source linked to conversation`,
      status: "verified",
    });
  }

  function recordWorkerDecision(decision: "yes" | "no" | "human") {
    const reply = decision === "yes" ? "Yes, I can work this shift." : decision === "no" ? "No, I’m unavailable for this shift." : "I’d like to talk to a real person.";
    createMessage(selectedWorkerName, { body: reply, direction: "incoming", sender: "Worker", channel: selectedChannel, at: "17:05" });

    if (decision === "yes") {
      setWorkerDecisions((current) => ({ ...current, [selectedWorkerName]: "Working" }));
      assignAcceptedWorker(selectedWorkerName);
      if (aiAutoChat) createMessage(selectedWorkerName, { body: "Thanks — you’re confirmed. I’ve updated the hourly timetable and notified the manager.", direction: "outgoing", sender: "AI", channel: selectedChannel, at: "17:05" });
    } else if (decision === "no") {
      setWorkerDecisions((current) => ({ ...current, [selectedWorkerName]: "Unavailable" }));
      if (aiAutoChat) createMessage(selectedWorkerName, { body: "Thanks for letting me know. I won’t schedule you, and I’ll continue the recovery search.", direction: "outgoing", sender: "AI", channel: selectedChannel, at: "17:05" });
      appendAudit({ at: "17:05:10", tool: `${selectedChannel} Sandbox API`, action: `${selectedWorkerName} declined the shift`, evidence: "Worker excluded from this recovery plan", status: "verified" });
    } else {
      setWorkerDecisions((current) => ({ ...current, [selectedWorkerName]: "Human requested" }));
      setHumanTakeover((current) => ({ ...current, [selectedWorkerName]: true }));
      createMessage(selectedWorkerName, { body: "Understood — I’ve paused automation and handed this conversation to the duty manager.", direction: "system", sender: "System", channel: selectedChannel, at: "17:05" });
      appendAudit({ at: "17:05:10", tool: "Human handoff", action: `${selectedWorkerName} requested a real person`, evidence: "AI paused for this conversation · manager alerted", status: "verified" });
    }
  }

  function resumeAiConversation() {
    setHumanTakeover((current) => ({ ...current, [selectedWorkerName]: false }));
    setWorkerDecisions((current) => ({ ...current, [selectedWorkerName]: "Pending" }));
    createMessage(selectedWorkerName, { body: "AI assistance resumed by the manager.", direction: "system", sender: "System", channel: selectedChannel, at: "17:06" });
  }

  function updateTimetableRow(rowId: number, patch: Partial<Pick<TimetableRow, "time" | "demand" | "required">>) {
    setTimetable((current) => current.map((row) => row.id === rowId ? { ...row, ...patch } : row));
  }

  function addWorkerToHour(rowId: number, name: string) {
    if (!name) return;
    setTimetable((current) => current.map((row) => {
      if (row.id !== rowId || row.assignments.some((assignment) => assignment.name === name)) return row;
      return { ...row, assignments: [...row.assignments, { name, source: "manual" }] };
    }));
    appendAudit({
      at: "17:04:06",
      tool: "Timetable editor",
      action: `Manager added ${name} to an hourly staffing cell`,
      evidence: "Manual edit recorded · coverage recalculated",
      status: "verified",
    });
  }

  function removeWorkerFromHour(rowId: number, name: string) {
    setTimetable((current) => current.map((row) => row.id === rowId
      ? { ...row, assignments: row.assignments.filter((assignment) => assignment.name !== name) }
      : row));
    appendAudit({
      at: "17:04:09",
      tool: "Timetable editor",
      action: `Manager removed ${name} from an hourly staffing cell`,
      evidence: "Manual edit recorded · staffing gap recalculated",
      status: "verified",
    });
  }

  function addTimetableRow() {
    setTimetable((current) => {
      const last = current.at(-1);
      const nextHour = last ? (Number(last.time.split(":")[0]) + 1) % 24 : 15;
      const nextId = current.reduce((highest, row) => Math.max(highest, row.id), 0) + 1;
      return [...current, { id: nextId, time: `${String(nextHour).padStart(2, "0")}:00`, demand: "Low", required: 1, assignments: [] }];
    });
  }

  function removeTimetableRow(rowId: number) {
    setTimetable((current) => current.filter((row) => row.id !== rowId));
  }

  function applyAcceptedWorkers() {
    const acceptedByHour: Record<string, string[]> = {
      "16:00": ["Daniel"],
      "17:00": ["Daniel"],
      "18:00": ["Daniel"],
      "19:00": ["Daniel", "Mei"],
      "20:00": ["Daniel", "Mei"],
      "21:00": ["Daniel"],
      "22:00": ["Daniel"],
    };
    setTimetable((current) => current.map((row) => {
      const accepted = acceptedByHour[row.time] ?? [];
      const additions = accepted
        .filter((name) => !row.assignments.some((assignment) => assignment.name === name))
        .map((name) => ({ name, source: "ai" as const }));
      return additions.length > 0 ? { ...row, assignments: [...row.assignments, ...additions] } : row;
    }));
    setAiScheduleApplied(true);
    appendAudit({
      at: "17:03:11",
      tool: "AI timetable",
      action: "Inserted Daniel and Mei after accepted availability replies",
      evidence: "Seven Daniel cells + two Mei cells · green AI labels added",
      status: "verified",
    });
  }

  function startRecovery() {
    setStage("planning");
    appendAudit({
      at: "17:02:14",
      tool: "Policy engine",
      action: "Converted manager goal into operating constraints",
      evidence: "Budget ≤ S$150 · 18 roles · food-safety certification required",
      status: "verified",
    });
  }

  function beginNegotiation() {
    setStage("negotiating");
    appendAudit({
      at: "17:02:31",
      tool: "Roster solver",
      action: "Ranked six eligible workers across three outlets",
      evidence: "Skills, rest, hours, cost and travel checked",
      status: "verified",
    });
    appendAudit({
      at: "17:02:36",
      tool: "WhatsApp Sandbox",
      action: "Sent availability offers to Daniel, Marcus and Mei",
      evidence: "MSG-8831 · MSG-8832 · MSG-8833",
      status: "verified",
    });
  }

  function introduceSurprise() {
    setSurpriseIntroduced(true);
    applyAcceptedWorkers();
    appendAudit({
      at: "17:03:09",
      tool: "WhatsApp Sandbox",
      action: "Marcus declined and bookings increased by 12%",
      evidence: "Inbound reply MSG-8832 · demand feed EVT-392",
      status: "verified",
    });
    appendAudit({
      at: "17:03:12",
      tool: "Roster solver",
      action: "Replanned without Marcus and recalculated customer risk",
      evidence: "Three feasible recovery plans generated",
      status: "verified",
    });
  }

  function contactWorker(name: string) {
    if (contactedWorkers[name]) return;
    const worker = workerDirectory.find((entry) => entry.name === name);
    const receipt = `MSG-${8840 + Object.keys(contactedWorkers).length}`;
    setContactedWorkers((current) => ({ ...current, [name]: true }));
    if (worker) {
      selectWorkerContact(worker);
      navigateTo("Worker communications", "worker-communications");
    }
    appendAudit({
      at: "17:02:48",
      tool: "WhatsApp Sandbox",
      action: `Manager sent a follow-up availability request to ${name}`,
      evidence: `${receipt} · message delivered · no private absence details exposed`,
      status: "verified",
    });
  }

  function showApproval() {
    setStage("approval");
    appendAudit({
      at: "17:03:18",
      tool: "Approval policy",
      action: "Paused before overtime, roster and customer-facing changes",
      evidence: "APP-104 awaiting manager decision",
      status: "approval",
    });
  }

  function approvePlan() {
    setStage("executing");
    setAudit((current) => current.map((entry) => entry.status === "approval" ? { ...entry, status: "verified" } : entry));
    appendAudit({
      at: "17:03:29",
      tool: "Manager approval",
      action: `Plan ${selectedPlan} approved`,
      evidence: `APP-104 · additional cost S$${chosenPlan.cost}`,
      status: "verified",
    });
  }

  function verifyExecution() {
    setStage("resolved");
    setAudit((current) => [
      ...current,
      {
        at: "17:03:34",
        tool: "Workforce DB",
        action: "Updated Orchard and Tampines assignments",
        evidence: "Roster version 18 → 19 · read-back matched",
        status: "verified",
      },
      {
        at: "17:03:37",
        tool: "WhatsApp Sandbox",
        action: "Delivered confirmations to Daniel and Mei",
        evidence: "Two delivery receipts received",
        status: "verified",
      },
      {
        at: "17:03:41",
        tool: "Bookings",
        action: "Verified all reservations remain serviceable",
        evidence: `${chosenPlan.protected}/42 protected · S$5,800 revenue protected`,
        status: "verified",
      },
    ]);
  }

  function resetDemo() {
    setStage("detected");
    setSelectedPlan("A");
    setSurpriseIntroduced(false);
    setAudit(baseAudit);
    setActiveView("Incident overview");
    setContactedWorkers({});
    setTimetable(initialTimetable);
    setAiScheduleApplied(false);
    setSelectedWorkerName("Daniel");
    setSelectedChannel("WhatsApp");
    setMessageDraft("");
    setAiAutoChat(true);
    setHumanTakeover({});
    setWorkerDecisions({});
    setWorkerChats(initialWorkerChats);
  }

  function downloadAudit() {
    const payload = {
      incident: "INC-2407",
      outlet,
      originalRoster,
      hourlyTimetable: timetable,
      workerCommunications: workerChats,
      goal,
      selectedPlan: chosenPlan,
      outcome: isResolved ? {
        resolutionTime: "1m 33s",
        rolesCovered: "18/18",
        reservationsProtected: chosenPlan.protected,
        revenueProtected: 5800,
        addedLabourCost: chosenPlan.cost,
        managerTimeSavedMinutes: 58,
      } : null,
      activity: audit,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "continuityos-incident-INC-2407.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="dashboard min-h-screen bg-muted/20 text-foreground">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r bg-background px-5 py-7 lg:flex">
        <button onClick={() => navigateTo("Incident overview", "incident-overview")} className="mb-10 flex items-center gap-2.5 rounded-lg px-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><ShieldCheck className="size-5" /></span>
          <span><span className="block text-lg font-semibold tracking-tight">ContinuityOS</span><span className="block text-[10px] tracking-[0.13em] text-muted-foreground uppercase">Operations agent</span></span>
        </button>
        <p className="mb-3 px-3.5 text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase">Incident workspace</p>
        <nav className="flex flex-col gap-1.5">
          <NavItem icon={House} label="Incident overview" hint="Risk and outcome" active={activeView === "Incident overview"} onClick={() => navigateTo("Incident overview", "incident-overview")} />
          <NavItem icon={Sparkles} label="Recovery plan" hint="Agent steps" active={activeView === "Recovery plan"} onClick={() => navigateTo("Recovery plan", "live-recovery")} />
          <NavItem icon={Table2} label="Staffing timetable" hint="Hourly coverage" active={activeView === "Staffing timetable"} onClick={() => navigateTo("Staffing timetable", "staffing-timetable")} />
          <NavItem icon={MessagesSquare} label="Worker communications" hint="AI chat and handoff" active={activeView === "Worker communications"} onClick={() => navigateTo("Worker communications", "worker-communications")} />
          <NavItem icon={Activity} label="Evidence log" hint="Actions and receipts" active={activeView === "Evidence log"} onClick={() => navigateTo("Evidence log", "audit-trail")} />
          <NavItem icon={Settings2} label="Rules & approvals" hint="Limits and control" active={activeView === "Rules & approvals"} onClick={() => navigateTo("Rules & approvals", "guardrails")} />
        </nav>
        <div className="mt-auto border-t pt-5">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-muted"><Utensils className="size-4" /></span>
            <div><p className="text-sm font-medium">Kopi &amp; Co.</p><p className="mt-0.5 text-xs text-muted-foreground">3 active outlets</p></div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-emerald-700"><span className="size-2 rounded-full bg-emerald-500" />8 sandbox systems connected</div>
        </div>
      </aside>

      <main className="min-h-screen lg:pl-60">
        <div className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur-sm">
          <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8 lg:px-10">
            <div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">INC-2407</span><ChevronRight className="size-3.5 text-muted-foreground" /><span className="font-medium">{activeView}</span></div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="hidden gap-1.5 sm:flex"><span className="size-1.5 rounded-full bg-emerald-500" />Sandbox connected</Badge>
              <Button onClick={resetDemo} size="sm" variant="outline"><RotateCcw className="size-3.5" />Reset demo</Button>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
          <header id="incident-overview" className="scroll-mt-24 flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge variant="destructive" className="gap-1.5"><AlertTriangle className="size-3" />High-impact disruption</Badge>
                <span className="text-xs text-muted-foreground">Detected 17:02 · Friday dinner service</span>
              </div>
              <h1 className="max-w-3xl text-3xl font-medium tracking-tight text-balance sm:text-4xl">Two absences put tonight&apos;s service at risk.</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">The agent is coordinating people, bookings and outlet constraints to protect service without exceeding the manager&apos;s limits.</p>
            </div>
            {isResolved && <Badge variant="outline" className="gap-1.5 border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800"><BadgeCheck className="size-4" />Recovery verified</Badge>}
          </header>

          <section aria-label="Incident metrics" className="mt-7 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Metric icon={ShieldCheck} label="Needs approval" value={metrics.approval} hint={needsApproval ? "Plan ready for review" : "No unsafe action taken"} accent={needsApproval} />
            <Metric icon={Users} label="Role coverage" value={metrics.coverage} hint="Required roles tonight" />
            <Metric icon={CircleDollarSign} label="Revenue protected" value={metrics.revenue} hint={isResolved ? "42 reservations retained" : "Verified after execution"} />
            <Metric icon={FileCheck2} label="Verified actions" value={String(metrics.actions)} hint="With evidence receipts" />
          </section>

          <section className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="space-y-6">
              <Card id="guardrails" className="scroll-mt-24">
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><CardTitle><h2 className="flex items-center gap-2"><Sparkles className="size-4" />Manager goal</h2></CardTitle><CardDescription>A meaningful outcome, not a sequence of commands.</CardDescription></div>
                    <Badge variant="outline">Context retained</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="rounded-xl border bg-muted/25 p-4 text-sm leading-6">&ldquo;{goal}&rdquo;</div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Constraint label="Budget" value="≤ S$150" />
                    <Constraint label="Coverage" value="18 required roles" />
                    <Constraint label="Safety" value="Certified staff only" />
                    <Constraint label="Fairness" value="Max 30h / worker" />
                  </div>
                  {stage === "detected" && <Button onClick={startRecovery} className="mt-5"><Play className="size-4" />Delegate recovery to agent</Button>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><CardTitle><h2 className="flex items-center gap-2"><MapPin className="size-4" />Outlet and original roster</h2></CardTitle><CardDescription>The operating context before the disruption occurred.</CardDescription></div>
                    <Badge variant="outline">{outlet.serviceDate}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <LocationDetail icon={Utensils} label="Restaurant" value={outlet.name} />
                    <LocationDetail icon={MapPin} label="Location" value={outlet.address} />
                    <LocationDetail icon={CalendarDays} label="Service" value={outlet.serviceWindow} />
                    <LocationDetail icon={Navigation} label="Nearest support" value={outlet.nearby} />
                  </div>

                  <div className="mt-5 overflow-x-auto rounded-xl border">
                    <table className="w-full min-w-[46rem] text-left text-xs">
                      <thead className="border-b bg-muted/50 text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
                        <tr><th className="px-4 py-3 font-medium">Originally working</th><th className="px-4 py-3 font-medium">Role and shift</th><th className="px-4 py-3 font-medium">Qualifications</th><th className="px-4 py-3 font-medium">Status on 16 Oct</th><th className="px-4 py-3 font-medium">Reason</th></tr>
                      </thead>
                      <tbody className="divide-y">
                        {originalRoster.map((worker) => (
                          <tr key={worker.name}>
                            <td className="px-4 py-3 font-medium">{worker.name}</td>
                            <td className="px-4 py-3"><span className="block">{worker.role}</span><span className="mt-0.5 block text-muted-foreground">{worker.shift}</span></td>
                            <td className="px-4 py-3 text-muted-foreground">{worker.qualification}</td>
                            <td className="px-4 py-3"><Badge variant="outline" className={worker.status === "Unavailable" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"}>{worker.status}</Badge></td>
                            <td className="px-4 py-3 text-muted-foreground">{worker.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 size-3.5 shrink-0" /><span>Managers see only the minimum useful reason category. Replacement messages never reveal who is absent or why.</span></div>
                </CardContent>
              </Card>

              <Card id="staffing-timetable" className="scroll-mt-24">
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle><h2 className="flex items-center gap-2"><Table2 className="size-4" />Hourly staffing timetable</h2></CardTitle>
                      <CardDescription>Edit it like a spreadsheet, or let accepted availability replies fill the cells automatically.</CardDescription>
                    </div>
                    <Badge variant="outline" className={aiScheduleApplied ? "border-emerald-200 bg-emerald-50 text-emerald-800" : ""}>
                      {aiScheduleApplied ? <><Bot className="size-3" />AI assignments synced</> : "Live editable grid"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 grid gap-3 sm:grid-cols-3">
                    <Constraint label="Planning unit" value="One-hour blocks" />
                    <Constraint label="Demand source" value="Bookings + POS forecast" />
                    <Constraint label="Automation" value="Accepted replies → timetable" />
                  </div>
                  <div className="overflow-x-auto rounded-xl border">
                    <table className="staffing-grid w-full min-w-[68rem] text-left text-xs">
                      <thead className="border-b bg-muted/55 text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
                        <tr>
                          <th className="w-24 px-3 py-3 font-medium">Hour</th>
                          <th className="w-32 px-3 py-3 font-medium">Customer demand</th>
                          <th className="w-24 px-3 py-3 font-medium">Staff needed</th>
                          <th className="w-28 px-3 py-3 font-medium">Work still needed</th>
                          <th className="px-3 py-3 font-medium">Who is working</th>
                          <th className="w-14 px-3 py-3 text-center font-medium">Row</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {timetable.map((row) => {
                          const gap = Math.max(row.required - row.assignments.length, 0);
                          const availableWorkers = workerOptions.filter((name) => !row.assignments.some((assignment) => assignment.name === name));
                          return (
                            <tr key={row.id} className="align-top hover:bg-muted/20">
                              <td className="px-3 py-3">
                                <label className="sr-only" htmlFor={`time-${row.id}`}>Hour</label>
                                <input id={`time-${row.id}`} value={row.time} onChange={(event) => updateTimetableRow(row.id, { time: event.target.value })} className="timetable-input w-[4.8rem] font-mono" />
                              </td>
                              <td className="px-3 py-3">
                                <label className="sr-only" htmlFor={`demand-${row.id}`}>Customer demand at {row.time}</label>
                                <select id={`demand-${row.id}`} value={row.demand} onChange={(event) => updateTimetableRow(row.id, { demand: event.target.value as TimetableRow["demand"] })} className="timetable-input w-full">
                                  {(["Low", "Build-up", "Moderate", "High", "Peak", "Close"] as TimetableRow["demand"][]).map((demand) => <option key={demand}>{demand}</option>)}
                                </select>
                              </td>
                              <td className="px-3 py-3">
                                <label className="sr-only" htmlFor={`required-${row.id}`}>Staff needed at {row.time}</label>
                                <input id={`required-${row.id}`} type="number" min="0" max="20" value={row.required} onChange={(event) => updateTimetableRow(row.id, { required: Math.max(0, Number(event.target.value)) })} className="timetable-input w-16 text-center tabular-nums" />
                              </td>
                              <td className="px-3 py-3">
                                <Badge variant="outline" className={gap > 0 ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}>
                                  {gap > 0 ? `${gap} ${gap === 1 ? "person" : "people"}` : "Covered"}
                                </Badge>
                              </td>
                              <td className="px-3 py-3">
                                <div className="flex min-h-8 flex-wrap items-center gap-1.5">
                                  {row.assignments.map((assignment) => (
                                    <span key={assignment.name} className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 ${assignment.source === "ai" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "bg-background"}`}>
                                      {assignment.source === "ai" && <Bot className="size-3" />}
                                      <span>{assignment.name}</span>
                                      <button onClick={() => removeWorkerFromHour(row.id, assignment.name)} aria-label={`Remove ${assignment.name} from ${row.time}`} className="rounded-sm p-0.5 text-muted-foreground hover:bg-black/5 hover:text-foreground"><X className="size-3" /></button>
                                    </span>
                                  ))}
                                  <label className="sr-only" htmlFor={`add-worker-${row.id}`}>Add worker at {row.time}</label>
                                  <select id={`add-worker-${row.id}`} value="" onChange={(event) => addWorkerToHour(row.id, event.target.value)} className="timetable-add">
                                    <option value="">+ Add worker</option>
                                    {availableWorkers.map((name) => <option key={name} value={name}>{name}</option>)}
                                  </select>
                                </div>
                              </td>
                              <td className="px-3 py-3 text-center">
                                <button onClick={() => removeTimetableRow(row.id)} aria-label={`Delete ${row.time} row`} className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-700"><Trash2 className="size-4" /></button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <Button onClick={addTimetableRow} size="sm" variant="outline"><Plus className="size-3.5" />Add hour</Button>
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="max-w-md text-right text-[11px] leading-5 text-muted-foreground">Green <Bot className="mx-0.5 inline size-3" /> cells were inserted by the agent from verified worker replies. Every manual edit remains removable.</p>
                      <Button onClick={applyAcceptedWorkers} size="sm" variant="outline" disabled={!surpriseIntroduced || aiScheduleApplied}>
                        <Bot className="size-3.5" />{aiScheduleApplied ? "AI schedule synced" : surpriseIntroduced ? "AI-fill accepted workers" : "Waiting for replies"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card id="worker-communications" className="scroll-mt-24">
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle><h2 className="flex items-center gap-2"><MessagesSquare className="size-4" />Worker communications</h2></CardTitle>
                      <CardDescription>Contact every worker through a sandbox API, continue inside the project, or open the selected messaging app.</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">10 workers · 3 channels</Badge>
                      <button onClick={toggleAiConversation} aria-pressed={aiAutoChat} className={`inline-flex min-h-8 items-center gap-2 rounded-lg border px-3 text-xs font-medium ${aiAutoChat ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "bg-background text-muted-foreground"}`}>
                        <Bot className="size-3.5" />{aiAutoChat ? "AI starts chats" : "Human starts chats"}
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid overflow-hidden rounded-xl border lg:grid-cols-[17rem_minmax(0,1fr)]">
                    <div className="border-b bg-muted/20 lg:border-r lg:border-b-0">
                      <div className="border-b px-4 py-3">
                        <p className="text-[10px] font-medium tracking-[0.1em] text-muted-foreground uppercase">Restaurant workforce</p>
                        <p className="mt-1 text-xs text-muted-foreground">Choose a person to open their conversation.</p>
                      </div>
                      <div className="max-h-[32rem] overflow-y-auto p-2">
                        {workerDirectory.map((worker) => {
                          const decision = workerDecisions[worker.name];
                          const displayedStatus: string = decision ?? worker.status;
                          const statusDot = displayedStatus === "Unavailable" ? "bg-red-400" : displayedStatus === "Human requested" ? "bg-amber-500" : displayedStatus === "Awaiting reply" || displayedStatus === "Pending" ? "bg-slate-400" : "bg-emerald-500";
                          return (
                            <button key={worker.name} onClick={() => selectWorkerContact(worker)} className={`mb-1 flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition-colors ${selectedWorkerName === worker.name ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                              <span className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${selectedWorkerName === worker.name ? "bg-primary-foreground/15" : "bg-background border"}`}>{worker.name.slice(0, 2).toUpperCase()}</span>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center justify-between gap-2"><span className="truncate text-xs font-medium">{worker.name}</span><span className={`size-2 shrink-0 rounded-full ${statusDot}`} /></span>
                                <span className={`mt-0.5 block truncate text-[10px] ${selectedWorkerName === worker.name ? "text-primary-foreground/65" : "text-muted-foreground"}`}>{worker.role} · {worker.outlet}</span>
                                <span className={`mt-1 block text-[9px] ${selectedWorkerName === worker.name ? "text-primary-foreground/75" : "text-muted-foreground"}`}>{displayedStatus} · {worker.channels.join(" / ")}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="min-w-0 bg-background">
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-4 sm:px-5">
                        <div className="flex items-center gap-3">
                          <span className="flex size-10 items-center justify-center rounded-full bg-muted text-xs font-semibold">{selectedWorker.name.slice(0, 2).toUpperCase()}</span>
                          <div><p className="text-sm font-medium">{selectedWorker.name}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{selectedWorker.role} · {selectedWorker.outlet} outlet</p></div>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {selectedWorker.channels.map((channel) => (
                            <button key={channel} onClick={() => setSelectedChannel(channel)} className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] ${selectedChannel === channel ? "border-foreground bg-foreground text-background" : "bg-background"}`}>
                              {channel === "SMS" ? <Phone className="size-3" /> : <Send className="size-3" />}{channel}
                            </button>
                          ))}
                          <a href={channelAppUrls[selectedChannel]} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium hover:bg-muted" aria-label={`Open ${selectedChannel} app`}>
                            <ExternalLink className="size-3" />Open app
                          </a>
                        </div>
                      </div>

                      {humanTakeover[selectedWorkerName] && (
                        <div className="m-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                          <div><p className="text-xs font-medium text-amber-900">Human conversation requested</p><p className="mt-0.5 text-[10px] text-amber-800">AI automation is paused for {selectedWorkerName}. The manager can continue below.</p></div>
                          <Button onClick={resumeAiConversation} size="sm" variant="outline" className="bg-background"><Bot className="size-3.5" />Resume AI</Button>
                        </div>
                      )}

                      <div role="log" aria-label={`Conversation with ${selectedWorkerName}`} className="flex min-h-64 max-h-[22rem] flex-col gap-3 overflow-y-auto bg-muted/10 p-4 sm:p-5">
                        {selectedMessages.length === 0 ? (
                          <div className="m-auto max-w-sm text-center"><MessageSquare className="mx-auto size-6 text-muted-foreground" /><p className="mt-3 text-sm font-medium">No conversation yet</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{selectedWorker.status === "Unavailable" ? "This worker is unavailable. A manager can still start a necessary message." : "Start manually, or enable AI to send the opening shift request."}</p>{aiAutoChat && selectedWorker.status !== "Unavailable" && <Button onClick={() => startAiConversation(selectedWorker)} size="sm" variant="outline" className="mt-3 bg-background"><Bot className="size-3.5" />Start AI conversation</Button>}</div>
                        ) : selectedMessages.map((message) => (
                          <div key={message.id} className={`max-w-[82%] rounded-xl border px-3 py-2.5 ${message.direction === "incoming" ? "self-start bg-background" : message.direction === "system" ? "self-center border-amber-200 bg-amber-50 text-amber-900" : "self-end border-slate-800 bg-slate-900 text-white"}`}>
                            <div className="flex items-center gap-2 text-[9px] opacity-65"><span>{message.sender}</span><span>·</span><span>{message.channel}</span><span>·</span><span>{message.at}</span></div>
                            <p className="mt-1 text-xs leading-5">{message.body}</p>
                          </div>
                        ))}
                      </div>

                      {selectedDecision === "Pending" && selectedMessages.length > 0 && !humanTakeover[selectedWorkerName] && (
                        <div className="border-t bg-muted/20 px-4 py-3 sm:px-5">
                          <p className="mb-2 text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">Worker quick replies</p>
                          <div className="flex flex-wrap gap-2">
                            <Button onClick={() => recordWorkerDecision("yes")} size="sm" variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800"><Check className="size-3.5" />Yes, I can work</Button>
                            <Button onClick={() => recordWorkerDecision("no")} size="sm" variant="outline" className="border-red-200 bg-red-50 text-red-700"><X className="size-3.5" />No, I’m unavailable</Button>
                            <Button onClick={() => recordWorkerDecision("human")} size="sm" variant="outline"><Users className="size-3.5" />Talk to a real person</Button>
                          </div>
                        </div>
                      )}

                      <div className="border-t p-4 sm:p-5">
                        <div className="flex gap-2">
                          <label htmlFor="worker-message" className="sr-only">Message {selectedWorkerName}</label>
                          <input id="worker-message" value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") sendConversationMessage(); }} placeholder={`Message ${selectedWorkerName} via ${selectedChannel}…`} className="min-h-10 min-w-0 flex-1 rounded-lg border bg-background px-3 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/20" />
                          <Button onClick={sendConversationMessage} disabled={!messageDraft.trim()}><Send className="size-4" />Send via API</Button>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground"><span>Public demo: sandbox only; no real worker is contacted.</span><span>{humanTakeover[selectedWorkerName] || !aiAutoChat ? "Sending as manager" : "AI may continue automatically"}</span></div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card id="live-recovery" className="scroll-mt-24">
                <CardHeader>
                  <CardTitle><h2 className="flex items-center gap-2"><RefreshCw className="size-4" />Live recovery</h2></CardTitle>
                  <CardDescription>The plan changes as new information arrives.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Incident outlet="Orchard" role="Closing lead · 16:00–22:00" person="Aisha reported sick" risk="26 reservations at risk" />
                    <Incident outlet="Orchard" role="Service crew · 17:00–22:00" person="Ben cannot attend" risk="S$5,800 combined exposure" />
                  </div>

                  {stageIndex >= 1 && (
                    <div className="mt-6 border-t pt-5">
                      <div className="mb-4 flex items-center justify-between gap-3"><h3 className="text-sm font-medium">Agent plan</h3><span className="text-xs text-muted-foreground">3 tools · 2 approval gates</span></div>
                      <ol className="space-y-0">
                        <PlanStep number="1" title="Assess operational and customer impact" detail="Workforce DB + bookings" status={stageIndex >= 1 ? "done" : "waiting"} />
                        <PlanStep number="2" title="Find and negotiate with qualified workers" detail="Roster solver + WhatsApp sandbox" status={stageIndex >= 2 ? "done" : stageIndex === 1 ? "active" : "waiting"} />
                        <PlanStep number="3" title="Compare recovery options" detail="Cost + fairness + service impact" status={stageIndex >= 3 ? "done" : stageIndex === 2 ? "active" : "waiting"} />
                        <PlanStep number="4" title="Request manager approval" detail="Required before overtime and roster changes" status={stageIndex >= 4 ? "done" : stageIndex === 3 ? "approval" : "waiting"} />
                        <PlanStep number="5" title="Execute and verify every action" detail="Roster + messages + booking read-back" status={stageIndex >= 5 ? "done" : stageIndex === 4 ? "active" : "waiting"} last />
                      </ol>
                      {stage === "planning" && <Button onClick={beginNegotiation} className="mt-5">Run eligibility checks<ArrowRight className="size-4" /></Button>}
                    </div>
                  )}
                </CardContent>
              </Card>

              {stageIndex >= 2 && (
                <Card>
                  <CardHeader>
                    <CardTitle><h2 className="flex items-center gap-2"><MessageSquare className="size-4" />Availability negotiation</h2></CardTitle>
                    <CardDescription>The agent ranks candidates using qualifications, fairness, cost and travel time.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <Candidate rank="1" name="Daniel" detail="Somerset · Food-safety lead · 18/30h · 14 min · +S$64" state={surpriseIntroduced ? "Accepted" : "Offer delivered"} positive={surpriseIntroduced} canContact={!surpriseIntroduced} contacted={contactedWorkers.Daniel} onContact={() => contactWorker("Daniel")} />
                      <Candidate rank="2" name="Marcus" detail="Bugis · Food-safety lead · 20/30h · 9 min · +S$71" state={surpriseIntroduced ? "Declined" : "Awaiting reply"} declined={surpriseIntroduced} canContact={!surpriseIntroduced} contacted={contactedWorkers.Marcus} onContact={() => contactWorker("Marcus")} />
                      <Candidate rank="3" name="Mei" detail="Tampines · Service crew · 22/30h · from 19:00 · +S$60" state={surpriseIntroduced ? "Accepted 2h" : "Offer delivered"} positive={surpriseIntroduced} canContact={!surpriseIntroduced} contacted={contactedWorkers.Mei} onContact={() => contactWorker("Mei")} />
                    </div>
                    {!surpriseIntroduced && stage === "negotiating" && (
                      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                        <div className="flex gap-3"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" /><div><p className="text-sm font-medium">Introduce the live surprise</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Marcus declines while dinner bookings increase by 12%. The agent must recover without restarting.</p></div></div>
                        <Button onClick={introduceSurprise} size="sm" variant="outline" className="mt-4 bg-background">Simulate changed conditions</Button>
                      </div>
                    )}
                    {surpriseIntroduced && stage === "negotiating" && (
                      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                        <div className="flex gap-3"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-700" /><div><p className="text-sm font-medium">Plan recovered in 3 seconds</p><p className="mt-1 text-xs text-muted-foreground">Marcus was removed, customer risk was recalculated and three feasible alternatives remain.</p></div></div>
                        <Button onClick={showApproval} size="sm">Compare recovery plans<ArrowRight className="size-3.5" /></Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {stageIndex >= 3 && (
                <Card className={needsApproval ? "ring-1 ring-amber-300" : ""}>
                  <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div><CardTitle><h2 className="flex items-center gap-2"><ShieldCheck className="size-4" />Manager approval</h2></CardTitle><CardDescription>The agent pauses before consequential actions.</CardDescription></div>
                      <Badge variant={needsApproval ? "secondary" : "outline"}>{needsApproval ? "Decision required" : isResolved ? "Approved and completed" : "Approved"}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3">
                      {plans.map((plan) => (
                        <button key={plan.id} disabled={!needsApproval} onClick={() => setSelectedPlan(plan.id)} className={`recovery-plan text-left ${selectedPlan === plan.id ? "recovery-plan-selected" : ""}`}>
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background text-sm font-semibold">{plan.id}</span>
                          <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="font-medium">{plan.name}</span>{plan.recommended && <Badge className="text-[10px]">Recommended</Badge>}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{plan.description}</span><span className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs"><span>S${plan.cost} added cost</span><span>{plan.affected} customers affected</span><span>{plan.fairness}</span></span></span>
                          {selectedPlan === plan.id && <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />}
                        </button>
                      ))}
                    </div>
                    {needsApproval && <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-5"><p className="text-xs text-muted-foreground">Approval authorises overtime, roster updates and staff confirmations.</p><Button onClick={approvePlan}>Approve Plan {selectedPlan}<ShieldCheck className="size-4" /></Button></div>}
                    {stage === "executing" && <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 p-4"><div><p className="text-sm font-medium">Approved. Ready to execute safely.</p><p className="mt-1 text-xs text-muted-foreground">The agent will update systems, read back the results and record evidence.</p></div><Button onClick={verifyExecution}>Execute and verify<ArrowRight className="size-4" /></Button></div>}
                  </CardContent>
                </Card>
              )}

              {isResolved && (
                <Card className="border-emerald-200 bg-emerald-50/30">
                  <CardHeader>
                    <CardTitle><h2 className="flex items-center gap-2 text-emerald-900"><BadgeCheck className="size-5" />Disruption resolved in 1m 33s</h2></CardTitle>
                    <CardDescription>All changes were executed, read back and verified against the manager&apos;s goal.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                      <Outcome value="18/18" label="roles covered" />
                      <Outcome value={`${chosenPlan.protected}/42`} label="reservations protected" />
                      <Outcome value="58 min" label="manager time saved" />
                      <Outcome value={`S$${chosenPlan.cost}`} label="additional cost" />
                    </div>
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-emerald-200 pt-5"><p className="text-xs text-emerald-900">No qualifications, hour caps, privacy rules or budget limits were violated.</p><Button onClick={downloadAudit} variant="outline" className="bg-background"><Download className="size-4" />Download evidence</Button></div>
                  </CardContent>
                </Card>
              )}
            </div>

            <aside className="space-y-6 xl:sticky xl:top-22">
              <Card id="audit-trail" className="scroll-mt-24">
                <CardHeader><CardTitle><h2 className="flex items-center gap-2"><Activity className="size-4" />Live activity</h2></CardTitle><CardDescription>What happened, where and with what proof.</CardDescription></CardHeader>
                <CardContent>
                  <div className="max-h-[36rem] space-y-0 overflow-y-auto pr-1">
                    {[...audit].reverse().map((entry, index) => <AuditRow key={`${entry.at}-${index}`} entry={entry} />)}
                  </div>
                  <div className="mt-4 border-t pt-4"><Button onClick={downloadAudit} variant="outline" className="w-full" disabled={audit.length === 0}><Download className="size-4" />Export audit JSON</Button></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle><h2 className="flex items-center gap-2"><Building2 className="size-4" />Systems and messaging APIs</h2></CardTitle><CardDescription>Sandboxed in this public demonstration.</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  <System icon={Users} name="Workforce database" status="Read + write sandbox" />
                  <System icon={Bot} name="AI conversation agent" status="Auto-start + human handoff" />
                  <System icon={MessageSquare} name="WhatsApp Cloud API" status="Primary contact · sandbox" />
                  <System icon={Send} name="Telegram Bot API" status="Worker chat · sandbox" />
                  <System icon={Phone} name="SMS fallback" status="Used after failed delivery" />
                  <System icon={Mail} name="Manager email" status="Outcome and evidence report" />
                  <System icon={Navigation} name="Maps travel time" status="Cross-outlet ranking input" />
                  <System icon={CalendarDays} name="Bookings and POS" status="Customer and revenue impact" />
                </CardContent>
              </Card>
            </aside>
          </section>
        </div>
      </main>
    </div>
  );
}

function NavItem({ icon: Icon, label, hint, active, onClick }: { icon: typeof House; label: string; hint: string; active: boolean; onClick: () => void }) {
  return <button onClick={onClick} className={`flex items-start gap-3 rounded-xl px-3.5 py-3 text-left transition-colors ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}><Icon className="mt-0.5 size-[18px] shrink-0" /><span><span className="block text-sm font-medium leading-5">{label}</span><span className={`block text-[10px] leading-4 ${active ? "text-primary-foreground/65" : "text-muted-foreground"}`}>{hint}</span></span></button>;
}

function Metric({ icon: Icon, label, value, hint, accent = false }: { icon: typeof Users; label: string; value: string; hint: string; accent?: boolean }) {
  return <div className={`rounded-2xl border bg-background p-4 sm:p-5 ${accent ? "border-amber-300 bg-amber-50/30" : ""}`}><div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{label}</span><Icon className="size-4" /></div><p className="mt-3 text-2xl font-medium tracking-tight tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{hint}</p></div>;
}

function Constraint({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-muted/60 px-3 py-2.5"><p className="text-[10px] font-medium tracking-[0.1em] text-muted-foreground uppercase">{label}</p><p className="mt-1 text-xs font-medium">{value}</p></div>;
}

function LocationDetail({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: string }) {
  return <div className="flex items-start gap-3 rounded-xl border bg-muted/20 p-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background"><Icon className="size-4" /></span><div><p className="text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">{label}</p><p className="mt-1 text-xs font-medium leading-5">{value}</p></div></div>;
}

function Incident({ outlet, role, person, risk }: { outlet: string; role: string; person: string; risk: string }) {
  return <div className="rounded-xl border p-4"><div className="flex items-center justify-between gap-3"><Badge variant="outline" className="gap-1"><MapPin className="size-3" />{outlet}</Badge><span className="text-[11px] text-red-600">Uncovered</span></div><p className="mt-3 text-sm font-medium">{role}</p><p className="mt-1 text-xs text-muted-foreground">{person} · reason kept private</p><p className="mt-3 flex items-center gap-1.5 text-xs text-amber-700"><AlertTriangle className="size-3.5" />{risk}</p></div>;
}

function PlanStep({ number, title, detail, status, last = false }: { number: string; title: string; detail: string; status: "done" | "active" | "approval" | "waiting"; last?: boolean }) {
  const style = status === "done" ? "bg-emerald-100 text-emerald-700" : status === "active" ? "bg-primary text-primary-foreground" : status === "approval" ? "bg-amber-100 text-amber-800" : "bg-muted text-muted-foreground";
  return <li className="flex gap-3"><div className="flex flex-col items-center"><span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium ${style}`}>{status === "done" ? <Check className="size-3.5" /> : number}</span>{!last && <span className="h-9 w-px bg-border" />}</div><div className="pb-4"><p className="text-sm font-medium">{title}{status === "approval" && <span className="ml-2 text-xs font-normal text-amber-700">Your approval</span>}</p><p className="mt-0.5 text-xs text-muted-foreground">{detail}</p></div></li>;
}

function Candidate({ rank, name, detail, state, positive = false, declined = false, canContact = false, contacted = false, onContact }: { rank: string; name: string; detail: string; state: string; positive?: boolean; declined?: boolean; canContact?: boolean; contacted?: boolean; onContact?: () => void }) {
  return <div className="flex flex-wrap items-center gap-3 rounded-xl border p-4"><span className="flex size-7 items-center justify-center rounded-lg bg-muted text-xs font-medium">{rank}</span><div className="min-w-0 flex-1"><p className="text-sm font-medium">{name}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div><div className="ml-auto flex items-center gap-2"><Badge variant="outline" className={positive ? "border-emerald-200 bg-emerald-50 text-emerald-800" : declined ? "border-red-200 bg-red-50 text-red-700" : ""}>{positive && <Check className="size-3" />}{declined && <X className="size-3" />}{state}</Badge>{canContact && <Button onClick={onContact} size="sm" variant="outline" disabled={contacted}>{contacted ? <Check className="size-3.5" /> : <Send className="size-3.5" />}{contacted ? "Follow-up sent" : "Contact"}</Button>}</div></div>;
}

function Outcome({ value, label }: { value: string; label: string }) {
  return <div className="rounded-xl border border-emerald-200 bg-background p-4"><p className="text-xl font-semibold tracking-tight tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></div>;
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  return <div className="relative border-l pl-4 pb-5 last:pb-0"><span className={`absolute -left-1 top-1 size-2 rounded-full ${entry.status === "approval" ? "bg-amber-500" : entry.status === "waiting" ? "bg-muted-foreground" : "bg-emerald-500"}`} /><div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground"><span className="font-mono">{entry.at}</span><Badge variant="outline" className="px-1.5 py-0 text-[9px]">{entry.tool}</Badge></div><p className="mt-1.5 text-xs font-medium leading-5">{entry.action}</p><p className="mt-1 text-[11px] leading-4 text-muted-foreground">{entry.evidence}</p></div>;
}

function System({ icon: Icon, name, status }: { icon: typeof Users; name: string; status: string }) {
  return <div className="flex items-center gap-3 rounded-xl border p-3"><span className="flex size-8 items-center justify-center rounded-lg bg-muted"><Icon className="size-4" /></span><div className="min-w-0 flex-1"><p className="text-xs font-medium">{name}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{status}</p></div><span className="size-2 rounded-full bg-emerald-500" /></div>;
}

"use client";

import { useText } from "@/components/products/sitecraft-ai/TextContext";
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ProductItem } from "@/types/content";
import {
  Lock,
  Globe,
  Activity,
  Zap,
  TrendingUp,
  ShieldAlert,
  Users,
  CheckCircle2,
  Clock,
  Sparkles,
  Bot,
  Kanban,
  Search,
  KeyRound,
  FileQuestion,
  Play,
  Share2,
  DollarSign,
  Database,
  Code2,
  Plus,
  LucideIcon,
} from "lucide-react";

interface ProductMockupProps {
  product: ProductItem;
  initialScreenIndex?: number;
  className?: string;
  showTabSelector?: boolean;
  compact?: boolean;
}

export default function ProductMockup({
  product,
  initialScreenIndex = 0,
  className = "",
  showTabSelector = true,
  compact = false,
}: ProductMockupProps) {
  const tx = useText();
  const [activeScreenIndex, setActiveScreenIndex] = useState(initialScreenIndex);
  const [activeHotspotId, setActiveHotspotId] = useState<string | null>(null);

  const activeScreen = product.screens[activeScreenIndex] || product.screens[0];

  return (
    <div
      className={`group relative rounded-2xl border border-border/80 bg-card shadow-2xl overflow-hidden backdrop-blur-xl transition-all duration-300 hover:border-primary/40 ${className}`}
    >
      {/* Browser Bar */}
      <div className="flex items-center justify-between border-b border-border/60 bg-muted/70 px-4 py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-rose-500/80 transition-opacity hover:opacity-100" />
            <span className="h-3 w-3 rounded-full bg-amber-500/80 transition-opacity hover:opacity-100" />
            <span className="h-3 w-3 rounded-full bg-emerald-500/80 transition-opacity hover:opacity-100" />
          </div>
          <div className="hidden sm:flex items-center gap-1.5 ml-4 rounded-md bg-background/60 border border-border/50 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            <Lock className="w-3 h-3 text-emerald-500" />
            <span className="truncate max-w-[200px]">{tx("catalog.productMockup.brand-com")}{product.panelPath}</span>
          </div>
        </div>

        {/* Screen Tabs Selector */}
        {showTabSelector && product.screens.length > 1 && (
          <div className="flex items-center gap-1 bg-background/50 p-1 rounded-lg border border-border/40">
            {product.screens.map((screen, idx) => (
              <button
                key={screen.id}
                onClick={() => setActiveScreenIndex(idx)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                  activeScreenIndex === idx
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                {screen.title.split(" ")[0]}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-[10px] font-bold uppercase tracking-wider text-primary border border-primary/20">
            <Sparkles className="w-2.5 h-2.5" />
            {tx("catalog.productMockup.live-panel")}</span>
        </div>
      </div>

      {/* Screen Title Bar (if multi-screen) */}
      {showTabSelector && activeScreen && (
        <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b border-border/40 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">{activeScreen.title}</span>
            {activeScreen.badge && (
              <span className="px-2 py-0.5 rounded-md bg-secondary/15 text-[10px] font-semibold text-secondary-foreground border border-secondary/20">
                {activeScreen.badge}
              </span>
            )}
          </div>
          <p className="text-muted-foreground hidden md:block text-[11px]">{activeScreen.description}</p>
        </div>
      )}

      {/* Mockup Canvas */}
      <div className={`relative bg-background/95 p-4 md:p-6 overflow-hidden ${compact ? "min-h-[220px]" : "min-h-[340px]"}`}>
        <MockupContent type={activeScreen?.mockupType || "admin-overview"} />

        {/* Interactive UI Hotspots Overlay Layer */}
        {product.hotspots && product.hotspots.length > 0 && !compact && (
          <div className="absolute inset-0 pointer-events-auto">
            {product.hotspots.map((hs) => {
              const isHovered = activeHotspotId === hs.id;
              return (
                <div
                  key={hs.id}
                  style={{ left: `${hs.x}%`, top: `${hs.y}%` }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 z-30"
                >
                  <button
                    onMouseEnter={() => setActiveHotspotId(hs.id)}
                    onMouseLeave={() => setActiveHotspotId(null)}
                    onClick={() => setActiveHotspotId(activeHotspotId === hs.id ? null : hs.id)}
                    className="group relative flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/40 focus:outline-none transition-transform hover:scale-110"
                    aria-label={hs.title}
                  >
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                    <Plus className="h-3.5 w-3.5 transition-transform group-hover:rotate-45" />
                  </button>

                  {/* Feature Popover */}
                  <AnimatePresence>
                    {isHovered && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 5 }}
                        className="absolute left-1/2 -translate-x-1/2 bottom-8 w-60 z-40 rounded-xl border border-border/80 bg-background/95 p-3 shadow-2xl backdrop-blur-xl pointer-events-none"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-xs text-foreground">{hs.title}</span>
                          {hs.badge && (
                            <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[9px] font-bold">
                              {hs.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">{hs.description}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Subtle Glow Overlay */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-background/40 via-transparent to-transparent opacity-60" />
    </div>
  );
}

function MockupContent({ type }: { type: string }) {
  const tx = useText();
  switch (type) {
    case "admin-overview":
    case "admin-ai-ledger":
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricWidget label={tx("catalog.productMockup.active-platform-revenue")} value="$284,500" change="+18.4%" icon={TrendingUp} color="emerald" />
            <MetricWidget label={tx("catalog.productMockup.active-projects-pms")} value="34 Live" change="100% On Track" icon={Activity} color="blue" />
            <MetricWidget label={tx("catalog.productMockup.openai-token-ledger")} value="4.2M Tokens" change="Est. $64.20" icon={Bot} color="purple" />
            <MetricWidget label={tx("catalog.productMockup.headcount-hrms")} value="142 Staff" change="98.2% Active" icon={Users} color="amber" />
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="flex items-center gap-2 text-foreground">
                <Activity className="w-4 h-4 text-primary" />{tx("catalog.productMockup.super-admin-live-stream-15-panels-synchr")}</span>
              <span className="text-primary font-mono text-[11px]">{tx("catalog.productMockup.live-60fps")}</span>
            </div>
            <div className="space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between p-2 rounded-lg bg-background/80 border border-border/40">
                <span className="flex items-center gap-2 text-foreground"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />{tx("catalog.productMockup.lms-lead-qualification-completed")}</span>
                <span className="text-muted-foreground">{tx("catalog.productMockup.just-now")}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-background/80 border border-border/40">
                <span className="flex items-center gap-2 text-foreground"><Bot className="w-3.5 h-3.5 text-purple-500" />{tx("catalog.productMockup.ai-bots-studio-executed-proposalgpt")}</span>
                <span className="text-muted-foreground">{tx("catalog.productMockup.12s-ago")}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-background/80 border border-border/40">
                <span className="flex items-center gap-2 text-foreground"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />{tx("catalog.productMockup.prms-po-8492-approved-by-cfo")}</span>
                <span className="text-muted-foreground">{tx("catalog.productMockup.1m-ago")}</span>
              </div>
            </div>
          </div>
        </div>
      );

    case "hrms-overview":
    case "hrms-recruitment":
    case "hrms-payroll":
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <MetricWidget label={tx("catalog.productMockup.total-employees")} value="142 Staff" change="9 Departments" icon={Users} color="teal" />
            <MetricWidget label={tx("catalog.productMockup.monthly-payroll")} value="$185,200" change="Biometric Verified" icon={DollarSign} color="emerald" />
            <MetricWidget label={tx("catalog.productMockup.ai-resume-score")} value="94% Match" change="12 Shortlisted" icon={Sparkles} color="purple" />
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2">
            <div className="text-xs font-semibold text-foreground mb-2 flex items-center justify-between">
              <span>{tx("catalog.productMockup.recruitment-ai-candidate-pipeline")}</span>
              <span className="text-primary/80 text-[11px] font-mono">{tx("catalog.productMockup.synced-with-careers-page")}</span>
            </div>
            <CandidateRow name="Sarah Jenkins" role="GenAI Engineer" score="98% AI Match" status="Shortlisted" />
            <CandidateRow name="David Miller" role="Full Stack MERN" score="92% AI Match" status="Interview Scheduled" />
            <CandidateRow name="Elena Rostova" role="UI/UX Lead" score="89% AI Match" status="Offer Sent" />
          </div>
        </div>
      );

    case "pms-board":
    case "pms-analytics":
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <MetricWidget label={tx("catalog.productMockup.active-projects")} value="28 Delivery" change="100% Guarded" icon={Kanban} color="blue" />
            <MetricWidget label={tx("catalog.productMockup.logged-timesheets")} value="1,840 hrs" change="Billing Ready" icon={Clock} color="cyan" />
            <MetricWidget label={tx("catalog.productMockup.avg-profit-margin")} value="38.5%" icon={TrendingUp} color="emerald" />
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <KanbanCol title={tx("catalog.productMockup.in-progress")} count={4} items={["Enterprise Portal v2.0", "AI Search Engine Optimization"]} />
            <KanbanCol title={tx("catalog.productMockup.quality-testing")} count={2} items={["CyberVault Vault Encryption Audit"]} />
            <KanbanCol title={tx("catalog.productMockup.completed-billed")} count={8} items={["EvalIQ Assessment Engine"]} />
          </div>
        </div>
      );

    case "lms-pipeline":
    case "lms-ai-agent":
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <MetricWidget label={tx("catalog.productMockup.total-inbound-leads")} value="482 / mo" change="+34% MoM" icon={Users} color="rose" />
            <MetricWidget label={tx("catalog.productMockup.24-7-ai-qualification")} value="99.4%" change="0s Lag" icon={Bot} color="purple" />
            <MetricWidget label={tx("catalog.productMockup.pipeline-value")} value="$1.42M" change="High Intent" icon={TrendingUp} color="emerald" />
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold mb-1">
              <span className="flex items-center gap-1.5 text-secondary-foreground">
                <Bot className="w-4 h-4 text-secondary-foreground" />{tx("catalog.productMockup.live-ai-voice-chat-assistant-transcript")}</span>
              <span className="text-[10px] bg-secondary/15 text-secondary-foreground border border-secondary/20 px-2 py-0.5 rounded-full font-mono">{tx("catalog.productMockup.autonomous-ai-active")}</span>
            </div>
            <div className="space-y-1.5 text-xs">
              <ChatBubble sender="Prospect" text={tx("catalog.productMockup.hi-we-need-an-ai-powered-hrms-and-assess")} align="left" />
              <ChatBubble sender="AI Assistant" text={tx("catalog.productMockup.great-brand-offers-integrated-hrms-w")} align="right" ai />
              <ChatBubble sender="Prospect" text={tx("catalog.productMockup.sure-alex-enterprise-com-we-have-200-emp")} align="left" />
            </div>
          </div>
        </div>
      );

    case "aibots-factory":
    case "aibots-chat":
    case "aibots-analytics":
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <MetricWidget label={tx("catalog.productMockup.active-enterprise-bots")} value="12 Bots" change="RAG Vector Indexed" icon={Bot} color="violet" />
            <MetricWidget label={tx("catalog.productMockup.private-vector-kb")} value="48 Documents" change="100% Encrypted" icon={Database} color="indigo" />
            <MetricWidget label={tx("catalog.productMockup.token-spend-ledger")} value="$42.10 / mo" change="OpenAI GPT-4o" icon={Sparkles} color="fuchsia" />
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-foreground flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" />{tx("catalog.productMockup.active-rag-bot-catalog")}</span>
              <span className="text-primary text-[11px] font-mono">{tx("catalog.productMockup.create-new-bot")}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <BotCard name="ProposalGPT" kb="24 Sales Files" model="GPT-4o" usage="1.2k chats" />
              <BotCard name="Requirement Analyzer AI" kb="12 Spec Files" model="GPT-4o" usage="840 chats" />
              <BotCard name="Tech Interview AI" kb="16 Question Banks" model="GPT-4o-mini" usage="620 chats" />
              <BotCard name="Legal & Compliance AI" kb="8 Policy Files" model="GPT-4o" usage="310 chats" />
            </div>
          </div>
        </div>
      );

    case "smms-generator":
    case "smms-reels":
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <MetricWidget label={tx("catalog.productMockup.multi-platform-output")} value="6 Channels" change="IG, YT, LinkedIn, FB" icon={Share2} color="pink" />
            <MetricWidget label={tx("catalog.productMockup.ai-video-reels")} value="18 Generated" change="Scene Scripts Ready" icon={Play} color="rose" />
            <MetricWidget label={tx("catalog.productMockup.brand-voice-compliance")} value="100% Context" change="Direct Product Sync" icon={CheckCircle2} color="emerald" />
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between font-semibold text-foreground">
              <span className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" />{tx("catalog.productMockup.ai-reel-script-generator-scene-by-scene")}</span>
              <span className="text-primary text-[11px]">{tx("catalog.productMockup.ready-for-approval")}</span>
            </div>
            <div className="bg-background/80 p-3 rounded-lg border border-border/50 font-mono space-y-1 text-[11px]">
              <p className="text-muted-foreground"><strong className="text-primary">{tx("catalog.productMockup.hook-0-3s")}</strong>{tx("catalog.productMockup.stop-using-10-separate-saas-tools-for-yo")}</p>
              <p className="text-muted-foreground"><strong className="text-foreground">{tx("catalog.productMockup.scene-1-3-8s")}</strong>{tx("catalog.productMockup.show-unified-staff-hub-sso-launcher-with")}</p>
              <p className="text-muted-foreground"><strong className="text-foreground">{tx("catalog.productMockup.cta-8-15s")}</strong>{tx("catalog.productMockup.visit-brand-com-to-explore-the-compl")}</p>
            </div>
          </div>
        </div>
      );

    case "ots-builder":
    case "ots-exam":
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <MetricWidget label={tx("catalog.productMockup.question-formats")} value="17 Types" change="Code, SQL, Video, MCQ" icon={FileQuestion} color="indigo" />
            <MetricWidget label={tx("catalog.productMockup.exam-security")} value="Server Guarded" change="Anti-Cheat Proctor" icon={ShieldAlert} color="amber" />
            <MetricWidget label={tx("catalog.productMockup.automated-evaluation")} value="Instant" change="Objective & Code" icon={CheckCircle2} color="emerald" />
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between font-semibold text-foreground">
              <span className="flex items-center gap-2"><Code2 className="w-4 h-4 text-secondary-foreground" />{tx("catalog.productMockup.candidate-coding-exam-sandbox")}</span>
              <span className="text-primary font-mono text-[11px]">{tx("catalog.productMockup.timer-44m-20s-remaining")}</span>
            </div>
            <div className="bg-background/90 p-3 rounded-lg border border-border/50 font-mono text-[11px] text-muted-foreground space-y-1">
              <p className="text-secondary-foreground/70 font-mono">{"// Task 2: Implement AI resume similarity scoring function"}</p>
              <p><span className="text-secondary-foreground">{tx("catalog.productMockup.function")}</span> <span className="text-primary">{tx("catalog.productMockup.calculatesimilarity")}</span>{tx("catalog.productMockup.candidate-requirement")}</p>
              <p className="pl-4">{tx("catalog.productMockup.return-openaivectorstore")}<span className="text-primary/80">{tx("catalog.productMockup.search")}</span>{tx("catalog.productMockup.candidate-embedding")}</p>
              <p>&#125;</p>
            </div>
          </div>
        </div>
      );

    case "seo-audit":
    case "seo-editor":
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <MetricWidget label={tx("catalog.productMockup.site-audit-score")} value="98 / 100" change="50+ Checks Clean" icon={Search} color="purple" />
            <MetricWidget label={tx("catalog.productMockup.dynamic-meta-tags")} value="Live No-Deploy" change="Instant Publish" icon={Zap} color="amber" />
            <MetricWidget label={tx("catalog.productMockup.keyword-tracking")} value="142 Tracked" change="+14 Top 3" icon={TrendingUp} color="emerald" />
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between font-semibold text-foreground">
              <span>{tx("catalog.productMockup.dynamic-meta-tag-schema-publisher")}</span>
              <span className="text-primary font-mono text-[11px]">{tx("catalog.productMockup.no-deployment-needed")}</span>
            </div>
            <div className="space-y-1.5 font-mono text-[11px]">
              <div className="p-2 rounded bg-background border border-border/40 flex justify-between">
                <span className="text-foreground">{tx("catalog.productMockup.page-title-brand-ai-powered-software")}</span>
                <span className="text-primary">{tx("catalog.productMockup.published")}</span>
              </div>
              <div className="p-2 rounded bg-background border border-border/40 flex justify-between">
                <span className="text-muted-foreground">{tx("catalog.productMockup.json-ld-schema-softwareapplication-schem")}</span>
                <span className="text-primary font-mono">{tx("catalog.productMockup.validated")}</span>
              </div>
            </div>
          </div>
        </div>
      );

    case "dlms-vault":
    case "dlms-expiry":
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <MetricWidget label={tx("catalog.productMockup.company-secrets")} value="84 Credentials" change="100% Encrypted" icon={KeyRound} color="amber" />
            <MetricWidget label={tx("catalog.productMockup.secret-reveal-audit")} value="Fully Logged" change="Masked by Default" icon={Lock} color="emerald" />
            <MetricWidget label={tx("catalog.productMockup.expiry-alerts")} value="0 Expired" change="Daily Sweeps Active" icon={ShieldAlert} color="blue" />
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between font-semibold text-foreground">
              <span className="flex items-center gap-2"><KeyRound className="w-4 h-4 text-primary" />{tx("catalog.productMockup.multi-tenant-client-vault")}</span>
              <span className="text-muted-foreground text-[11px]">{tx("catalog.productMockup.role-gated")}</span>
            </div>
            <div className="space-y-1 font-mono text-[11px]">
              <VaultItem title={tx("catalog.productMockup.aws-production-cloud")} username="admin@company.com" secret="••••••••••••••••" status="Audit Logged" />
              <VaultItem title={tx("catalog.productMockup.mongodb-enterprise-cluster")} username="dba_prod" secret="••••••••••••••••" status="Audit Logged" />
            </div>
          </div>
        </div>
      );

    // ── Sample-data previews for products added after the original catalogue (plain text: no catalogue dictionary keys). ──
    case "fms-invoices":
    case "fms-reports":
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <MetricWidget label="Receivables" value="Aged by bucket" change="Customer-wise" icon={DollarSign} color="blue" />
            <MetricWidget label="Payables" value="Bills due" change="Vendor-wise" icon={Clock} color="amber" />
            <MetricWidget label="Reports" value="P&L · Balance sheet" change="Cash flow · Tax" icon={TrendingUp} color="emerald" />
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between font-semibold text-foreground">
              <span>Invoices</span>
              <span className="text-muted-foreground text-[11px]">Sample data</span>
            </div>
            <CandidateRow name="INV-0001 · Acme Retail" role="Project: Website revamp" score="Sent" status="Awaiting payment" />
            <CandidateRow name="INV-0002 · Northwind Foods" role="Project: Mobile app" score="Paid" status="Receipt issued" />
            <CandidateRow name="INV-0003 · Globex Logistics" role="Project: Portal" score="Draft" status="Needs review" />
          </div>
        </div>
      );

    case "intelligence-chat":
    case "intelligence-table":
      return (
        <div className="space-y-3">
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
            <ChatBubble sender="You" text="Which projects have logged more hours than planned this quarter?" align="right" />
            <ChatBubble sender="AI Intelligence" text="3 projects are over their planned hours. The table below comes straight from your timesheets and projects." align="left" ai />
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between font-semibold text-foreground"><span>Project</span><span>Planned h</span><span>Logged h</span></div>
            <div className="flex items-center justify-between text-muted-foreground"><span>Website revamp</span><span>120</span><span>141</span></div>
            <div className="flex items-center justify-between text-muted-foreground"><span>Mobile app</span><span>300</span><span>322</span></div>
            <div className="flex items-center justify-between text-muted-foreground"><span>Client portal</span><span>80</span><span>93</span></div>
            <p className="pt-1 text-[10px] text-muted-foreground">Sample data. Real answers show only what you are allowed to see.</p>
          </div>
        </div>
      );

    case "sop-library":
    case "sop-acknowledge":
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <MetricWidget label="Active SOPs" value="Versioned" change="Compare any two" icon={FileQuestion} color="blue" />
            <MetricWidget label="Acknowledgements" value="Per person" change="Re-ask on new version" icon={CheckCircle2} color="emerald" />
            <MetricWidget label="Expiry" value="Review dates" change="Reminders sent" icon={Clock} color="amber" />
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between font-semibold text-foreground"><span>Policy library</span><span className="text-muted-foreground text-[11px]">Sample data</span></div>
            <CandidateRow name="Leave policy" role="HR · Internal" score="v3" status="Active" />
            <CandidateRow name="Vendor onboarding" role="Procurement · Management only" score="v1" status="Published" />
            <CandidateRow name="Data handling" role="IT · Confidential" score="v2" status="Active" />
          </div>
        </div>
      );

    case "cms-pages":
    case "cms-theme":
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <MetricWidget label="Pages" value="Draft → Publish" change="Version history" icon={Globe} color="blue" />
            <MetricWidget label="Collections" value="Blog · Jobs · More" change="Edited in one place" icon={Database} color="indigo" />
            <MetricWidget label="Theme" value="Colours & fonts" change="Preview before publish" icon={Sparkles} color="emerald" />
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between font-semibold text-foreground"><span>Pages</span><span className="text-muted-foreground text-[11px]">Sample data</span></div>
            <CandidateRow name="Home" role="/" score="v5" status="Published" />
            <CandidateRow name="Services" role="/services" score="v2" status="Published" />
            <CandidateRow name="Pricing" role="/pricing" score="v1" status="Draft" />
          </div>
        </div>
      );

    case "automation-list":
    case "automation-runs":
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <MetricWidget label="Trigger" value="A company event" change="Add conditions" icon={Zap} color="amber" />
            <MetricWidget label="Actions" value="Email · Notify · Webhook" change="Up to five per rule" icon={Play} color="blue" />
            <MetricWidget label="History" value="Every run" change="Result per action" icon={Clock} color="emerald" />
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between font-semibold text-foreground">
              <span>{type === "automation-runs" ? "Run history" : "Automations"}</span>
              <span className="text-muted-foreground text-[11px]">Sample data</span>
            </div>
            {type === "automation-runs" ? (
              <>
                <CandidateRow name="Invoice paid → email finance" role="Email" score="Success" status="Sent to finance" />
                <CandidateRow name="New lead → notify sales" role="Notification" score="Success" status="Sales role notified" />
                <CandidateRow name="Event → our system" role="Webhook" score="Failed" status="Endpoint not reachable" />
              </>
            ) : (
              <>
                <CandidateRow name="New lead → notify sales" role="When: Lead created" score="On" status="Last run: success" />
                <CandidateRow name="Invoice paid → email finance" role="When: Invoice paid" score="On" status="Last run: success" />
                <CandidateRow name="Task completed → notify project managers" role="When: Task completed" score="Off" status="Not run yet" />
              </>
            )}
          </div>
        </div>
      );

    default:
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <MetricWidget label={tx("catalog.productMockup.integrated-panels")} value="15 Systems" change="Single Identity" icon={Globe} color="blue" />
            <MetricWidget label={tx("catalog.productMockup.ai-powered")} value="100% Embedded" change="OpenAI RAG" icon={Bot} color="purple" />
            <MetricWidget label={tx("catalog.productMockup.security-audit")} value="100% RBAC" change="Real Time" icon={CheckCircle2} color="emerald" />
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between font-semibold text-foreground">
              <span>{tx("catalog.productMockup.brand-enterprise-ecosystem-control")}</span>
              <span className="text-primary font-mono text-[11px]">{tx("catalog.productMockup.active-suite")}</span>
            </div>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              {tx("catalog.productMockup.provides-unified-access-role-governance-")}</p>
          </div>
        </div>
      );
  }
}

/* Helper Micro-Components */
function MetricWidget({
  label,
  value,
  change,
  icon: Icon,
  color = "blue",
}: {
  label: string;
  value: string;
  change?: string;
  icon: LucideIcon;
  color?: string;
}) {
  // Map all color variants → brand tokens only (primary = coral #E56043, secondary = blue #1D428A)
  const colorMap: Record<string, string> = {
    // warm / action variants → primary (coral)
    emerald: "text-primary bg-primary/10 border-primary/20",
    rose:    "text-primary bg-primary/10 border-primary/20",
    amber:   "text-primary bg-primary/10 border-primary/20",
    pink:    "text-primary bg-primary/10 border-primary/20",
    fuchsia: "text-primary bg-primary/10 border-primary/20",
    // cool / informational variants → secondary (blue)
    blue:    "text-secondary-foreground bg-secondary/15 border-secondary/25",
    purple:  "text-secondary-foreground bg-secondary/15 border-secondary/25",
    teal:    "text-secondary-foreground bg-secondary/15 border-secondary/25",
    cyan:    "text-secondary-foreground bg-secondary/15 border-secondary/25",
    violet:  "text-secondary-foreground bg-secondary/15 border-secondary/25",
    indigo:  "text-secondary-foreground bg-secondary/15 border-secondary/25",
  };

  const style = colorMap[color] || "text-primary bg-primary/10 border-primary/20";

  return (
    <div className="rounded-xl border border-border/50 bg-background/80 p-3 shadow-sm backdrop-blur-md transition-all hover:border-primary/30">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-medium text-muted-foreground truncate">{label}</span>
        <div className={`p-1.5 rounded-lg border ${style}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
      </div>
      <div className="text-base font-extrabold tracking-tight text-foreground">{value}</div>
      {change && <div className="text-[10px] font-semibold text-primary mt-0.5">{change}</div>}
    </div>
  );
}

function CandidateRow({ name, role, score, status }: { name: string; role: string; score: string; status: string }) {
  return (
    <div className="flex items-center justify-between p-2 rounded-lg bg-background/90 border border-border/40 text-xs">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
          {name.charAt(0)}
        </div>
        <div>
          <div className="font-semibold text-foreground">{name}</div>
          <div className="text-[10px] text-muted-foreground">{role}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="px-2 py-0.5 rounded-full bg-secondary/15 text-secondary-foreground text-[10px] font-mono border border-secondary/20">
          {score}
        </span>
        <span className="text-[10px] font-semibold text-primary">{status}</span>
      </div>
    </div>
  );
}

function KanbanCol({ title, count, items }: { title: string; count: number; items: string[] }) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-2.5 space-y-2">
      <div className="flex items-center justify-between text-[11px] font-semibold text-foreground">
        <span>{title}</span>
        <span className="px-1.5 py-0.5 rounded bg-background text-[10px] border border-border/40">{count}</span>
      </div>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="p-2 rounded bg-background/90 border border-border/40 text-[11px] font-medium text-foreground shadow-xs">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function ChatBubble({ sender, text, align, ai }: { sender: string; text: string; align: "left" | "right"; ai?: boolean }) {
  return (
    <div className={`flex flex-col ${align === "right" ? "items-end" : "items-start"}`}>
      <span className="text-[9px] text-muted-foreground mb-0.5">{sender}</span>
      <div
        className={`max-w-[85%] p-2.5 rounded-2xl text-[11px] leading-relaxed ${
          ai
            ? "bg-secondary/20 text-foreground border border-secondary/30"
            : align === "right"
            ? "bg-primary text-primary-foreground"
            : "bg-background border border-border/50 text-foreground"
        }`}
      >
        {text}
      </div>
    </div>
  );
}

function BotCard({ name, kb, model, usage }: { name: string; kb: string; model: string; usage: string }) {
  const tx = useText();
  return (
    <div className="p-2.5 rounded-lg bg-background/90 border border-border/40 space-y-1">
      <div className="flex items-center justify-between">
        <span className="font-bold text-foreground text-[11px] flex items-center gap-1">
          <Bot className="w-3 h-3 text-primary" /> {name}
        </span>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-secondary/15 text-secondary-foreground font-mono">{model}</span>
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{tx("catalog.productMockup.kb")}{kb}</span>
        <span>{usage}</span>
      </div>
    </div>
  );
}

function VaultItem({ title, username, secret, status }: { title: string; username: string; secret: string; status: string }) {
  return (
    <div className="flex items-center justify-between p-2 rounded bg-background border border-border/40">
      <div>
        <div className="font-semibold text-foreground">{title}</div>
        <div className="text-[10px] text-muted-foreground">{username}</div>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-muted-foreground">{secret}</span>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">{status}</span>
      </div>
    </div>
  );
}

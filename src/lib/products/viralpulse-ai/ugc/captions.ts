import { estimateSpeakingSecs, LEAD_IN_SECS } from "./styles/language";
import type { AspectRatio, ScenePlan } from "./types";
import { AI_LABEL_TEXT, ILLUSTRATIVE_NOTICE } from "./policy";

/** Caption timing from the planned dialogue (SRT for the sidecar file, ASS for burning captions, the AI label and the notice into the video). */

export interface Cue {
  start: number;
  end: number;
  text: string;
  speakerId: string;
}

/** One cue per dialogue line, spread over the scene after a short lead-in in proportion to how long each line takes to say. */
export function buildCues(plan: ScenePlan, durationsOverride?: number[]): Cue[] {
  const cues: Cue[] = [];
  let offset = 0;
  plan.scenes.forEach((scene, i) => {
    const dur = durationsOverride?.[i] ?? scene.durationSecs;
    const lines = scene.dialogue;
    if (lines.length) {
      const want = lines.map((l) => Math.max(0.6, estimateSpeakingSecs(l.text, l.language || plan.language)));
      const avail = Math.max(0.5, dur - LEAD_IN_SECS - 0.2);
      const sum = want.reduce((a, b) => a + b, 0);
      const k = sum > avail ? avail / sum : 1;
      let t = offset + LEAD_IN_SECS;
      lines.forEach((l, j) => {
        const len = want[j] * k;
        cues.push({ start: round(t), end: round(Math.min(t + len, offset + dur)), text: l.text, speakerId: l.speakerId });
        t += len;
      });
    } else if (scene.voiceOver) {
      cues.push({ start: round(offset + LEAD_IN_SECS), end: round(offset + dur - 0.2), text: scene.voiceOver, speakerId: "" });
    }
    offset += dur;
  });
  return cues;
}

const round = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export function srtTime(t: number): string {
  const ms = Math.round(t * 1000);
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor((ms % 3600000) / 60000))}:${pad(Math.floor((ms % 60000) / 1000))},${pad(ms % 1000, 3)}`;
}

export function toSrt(cues: Cue[]): string {
  return cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join("\n");
}

function assTime(t: number): string {
  const cs = Math.round(t * 100);
  return `${Math.floor(cs / 360000)}:${pad(Math.floor((cs % 360000) / 6000))}:${pad(Math.floor((cs % 6000) / 100))}.${pad(cs % 100)}`;
}

const escAss = (s: string) => s.replace(/\\/g, "").replace(/[{}]/g, "").replace(/\r?\n/g, "\\N");

export type LabelPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";
const ALIGN: Record<LabelPosition, number> = { "bottom-left": 1, "bottom-right": 3, "top-left": 7, "top-right": 9 };

export function outputSize(aspect: AspectRatio): { w: number; h: number } {
  return aspect === "16:9" ? { w: 1280, h: 720 } : aspect === "1:1" ? { w: 720, h: 720 } : { w: 720, h: 1280 };
}

export interface AssOptions {
  cues: Cue[];
  totalSecs: number;
  aspect: AspectRatio;
  captions: boolean;
  aiLabel: { enabled: boolean; position: LabelPosition };
  illustrativeNotice: boolean;
}

/** ASS carries captions, the "AI generated" label and the illustrative notice in a single file, so one ffmpeg `subtitles` filter burns them all. */
export function toAss(o: AssOptions): string {
  const { w, h } = outputSize(o.aspect);
  const fs = Math.round(h * (o.aspect === "9:16" ? 0.034 : 0.05));
  const small = Math.round(fs * 0.62);
  const head = [
    "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${w}`, `PlayResY: ${h}`, "WrapStyle: 0", "",
    "[V4+ Styles]",
    "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding",
    `Style: Cap,Noto Sans,${fs},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,40,40,${Math.round(h * 0.14)},1`,
    `Style: Label,Noto Sans,${small},&H00FFFFFF,&H00FFFFFF,&H00000000,&H99000000,-1,0,0,0,100,100,0,0,3,4,0,${ALIGN[o.aiLabel.position]},24,24,${o.aiLabel.position.startsWith("top") ? Math.round(h * 0.05) : Math.round(h * 0.05)},1`,
    `Style: Notice,Noto Sans,${small},&H00FFFFFF,&H00FFFFFF,&H00000000,&H99000000,-1,0,0,0,100,100,0,0,3,4,0,8,24,24,${Math.round(h * (o.aiLabel.position.startsWith("top") ? 0.1 : 0.05))},1`,
    "", "[Events]", "Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text",
  ];
  const ev: string[] = [];
  const end = assTime(o.totalSecs);
  if (o.aiLabel.enabled) ev.push(`Dialogue: 1,${assTime(0)},${end},Label,,0,0,0,,${escAss(AI_LABEL_TEXT)}`);
  if (o.illustrativeNotice) ev.push(`Dialogue: 1,${assTime(0)},${end},Notice,,0,0,0,,${escAss(ILLUSTRATIVE_NOTICE)}`);
  if (o.captions) for (const c of o.cues) ev.push(`Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Cap,,0,0,0,,${escAss(c.text)}`);
  return [...head, ...ev, ""].join("\n");
}

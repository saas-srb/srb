import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCues, outputSize, toAss, toSrt, type LabelPosition } from "./captions";
import type { ScenePlan } from "./types";

/**
 * Scenes -> one video. Server-side concatenation with ffmpeg (one pass: scale/crop each clip to the output size, concat video and audio,
 * burn the ASS file holding captions + AI label + notice, H.264/AAC, faststart). The runner is injected so tests never need a binary.
 *
 * Why not the providers' own "extend"? Veo extension is 720p-only with 7 s steps and keeps the file on Google for 2 days; Omni extension is
 * documented only for a 40 s total and ties every scene to one interaction. Per-scene jobs are independently retryable and re-renderable
 * (regenerate one scene), which matters more than a seamless provider-side chain. Cost: ffmpeg needs a binary (`ffmpeg-static`, FFMPEG_PATH or one on PATH).
 */

/** Runs ffmpeg with `args` in working directory `cwd` (the ASS file is referenced by relative name). */
export type FfmpegRunner = (args: string[], cwd: string) => Promise<void>;

/**
 * Where the ffmpeg binary comes from, in order: FFMPEG_PATH (explicit), the `ffmpeg-static` package (bundled; next.config.ts
 * `outputFileTracingIncludes` ships it with the UGC routes), then `ffmpeg` on PATH. Returns null when none works.
 */
export async function findFfmpeg(): Promise<string | null> {
  return (await locateFfmpeg()).path;
}

export interface FfmpegLocation {
  path: string | null;
  source: "env" | "ffmpeg-static" | "path" | null;
  /** Why a candidate was skipped, for the health message. */
  tried: string[];
}

export async function locateFfmpeg(): Promise<FfmpegLocation> {
  const tried: string[] = [];
  const env = process.env.FFMPEG_PATH?.trim();
  if (env) {
    try {
      await access(env);
      return { path: env, source: "env", tried };
    } catch {
      tried.push(`FFMPEG_PATH is set to "${env}" but that file does not exist`);
    }
  }
  try {
    const name = "ffmpeg-static";
    const mod = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ name)) as { default?: string | null };
    if (mod.default) {
      try {
        await access(mod.default);
        return { path: mod.default, source: "ffmpeg-static", tried };
      } catch {
        tried.push("the ffmpeg-static package is installed but its binary is not available on this installation");
      }
    } else tried.push("ffmpeg-static has no binary for this platform");
  } catch {
    tried.push("the ffmpeg-static package is not installed");
  }
  const onPath = await new Promise<boolean>((resolve) => {
    const p = spawn("ffmpeg", ["-version"], { stdio: "ignore" });
    p.on("error", () => resolve(false));
    p.on("exit", (c) => resolve(c === 0));
  });
  if (onPath) return { path: "ffmpeg", source: "path", tried };
  tried.push("no ffmpeg on PATH");
  return { path: null, source: null, tried };
}

export interface FfmpegFeatures {
  version: string | null;
  /** `subtitles` filter (libass): burns captions, the AI label and the notice. */
  subtitles: boolean;
  /** `drawtext` filter (libfreetype). */
  drawtext: boolean;
}

/** Parses `ffmpeg -version` and `ffmpeg -filters` output (pure; the process runner is injected for tests). */
export function parseFfmpegFeatures(versionOut: string, filtersOut: string): FfmpegFeatures {
  const v = /ffmpeg version\s+(\S+)/i.exec(versionOut);
  const has = (name: string) => new RegExp(`^\\s*[A-Z.]{2,4}\\s+${name}\\s`, "m").test(filtersOut);
  return { version: v ? v[1] : null, subtitles: has("subtitles"), drawtext: has("drawtext") };
}

export type TextExec = (bin: string, args: string[]) => Promise<string>;

const defaultExec: TextExec = (bin, args) =>
  new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    p.stdout.on("data", (d) => (out = (out + d).slice(0, 200_000)));
    const t = setTimeout(() => {
      p.kill("SIGKILL");
      reject(new Error("ffmpeg did not answer"));
    }, 15_000);
    p.on("error", (e) => {
      clearTimeout(t);
      reject(e);
    });
    p.on("exit", () => {
      clearTimeout(t);
      resolve(out);
    });
  });

/** Runs the binary and reports which filters captions need. Throws if the binary cannot run. */
export async function probeFfmpeg(bin: string, exec: TextExec = defaultExec): Promise<FfmpegFeatures> {
  const [v, f] = await Promise.all([exec(bin, ["-hide_banner", "-version"]), exec(bin, ["-hide_banner", "-filters"])]);
  return parseFfmpegFeatures(v, f);
}

export function spawnRunner(bin: string, timeoutMs = 240_000): FfmpegRunner {
  return (args, cwd) =>
    new Promise((resolve, reject) => {
      const p = spawn(bin, ["-hide_banner", "-loglevel", "error", "-y", ...args], { cwd, stdio: ["ignore", "ignore", "pipe"] });
      let err = "";
      p.stderr.on("data", (d) => (err = (err + d).slice(-2000)));
      const t = setTimeout(() => {
        p.kill("SIGKILL");
        reject(new Error("ffmpeg timed out"));
      }, timeoutMs);
      p.on("error", (e) => {
        clearTimeout(t);
        reject(e);
      });
      p.on("exit", (code) => {
        clearTimeout(t);
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited ${code}: ${err.trim().slice(-400)}`));
      });
    });
}

export interface AssembleInput {
  clips: Buffer[];
  clipDurations: number[];
  plan: ScenePlan;
  captions: boolean;
  aiLabel: { enabled: boolean; position: LabelPosition };
  illustrativeNotice: boolean;
}

export interface Assembled {
  video: Buffer;
  thumbnail: Buffer | null;
  srt: string;
  durationSecs: number;
}

export function buildFilter(n: number, w: number, h: number, assName: string | null): string {
  const per = Array.from({ length: n }, (_, i) => `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,fps=30,format=yuv420p[v${i}];[${i}:a]aresample=48000,aformat=channel_layouts=stereo[a${i}]`);
  const join_ = Array.from({ length: n }, (_, i) => `[v${i}][a${i}]`).join("");
  const burn = assName ? `;[vc]subtitles=${assName}[v]` : "";
  return `${per.join(";")};${join_}concat=n=${n}:v=1:a=1[${assName ? "vc" : "v"}][a]${burn}`;
}

export async function assemble(input: AssembleInput, run: FfmpegRunner): Promise<Assembled> {
  const n = input.clips.length;
  if (n === 0) throw new Error("No clips to assemble.");
  const dir = await mkdtemp(join(tmpdir(), "ugc-"));
  try {
    const { w, h } = outputSize(input.plan.aspect);
    const durations = input.clipDurations;
    const cues = buildCues(input.plan, durations);
    const total = durations.reduce((a, b) => a + b, 0);
    const srt = toSrt(cues);
    const wantAss = input.captions || input.aiLabel.enabled || input.illustrativeNotice;
    for (let i = 0; i < n; i++) await writeFile(join(dir, `c${i}.mp4`), input.clips[i]);
    if (wantAss) await writeFile(join(dir, "o.ass"), toAss({ cues, totalSecs: total, aspect: input.plan.aspect, captions: input.captions, aiLabel: input.aiLabel, illustrativeNotice: input.illustrativeNotice }), "utf8");
    const args = [
      ...Array.from({ length: n }, (_, i) => ["-i", join(dir, `c${i}.mp4`)]).flat(),
      "-filter_complex", buildFilter(n, w, h, wantAss ? "o.ass" : null),
      "-map", "[v]", "-map", "[a]",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
      join(dir, "out.mp4"),
    ];
    await run(args, dir);
    const video = await readFile(join(dir, "out.mp4"));
    let thumbnail: Buffer | null = null;
    try {
      await run(["-ss", String(Math.min(1, Math.max(0, total / 4))), "-i", join(dir, "out.mp4"), "-frames:v", "1", "-q:v", "3", join(dir, "thumb.jpg")], dir);
      thumbnail = await readFile(join(dir, "thumb.jpg"));
    } catch {
      thumbnail = null;
    }
    return { video, thumbnail, srt, durationSecs: total };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

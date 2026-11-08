"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Gamepad2, Medal, Pause, Play, RotateCcw, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The little runner game on the 404, no-workspace and maintenance pages (the Chrome-offline dinosaur, with this app's cartoon runner): jump
 * over crates with Space / ↑ / tap, the world speeds up, the score counts the distance. Drawn on a canvas in the colours of whichever
 * company's site it is on. A finished run is sent to the server (`/api/game`) and the best scores of that address are listed beside it.
 * Nothing runs until the first jump, it pauses when hidden or scrolled away, and it never uses the page's own scroll keys unless it has focus.
 */

type Phase = "idle" | "running" | "paused" | "over";
type Row = { name: string; score: number; you: boolean };
type State = { best: number; plays: number; top: Row[] };

const H_DESKTOP = 232;
const H_MOBILE = 178;
const GROUND = 34;
const PX = 58;
const GRAVITY = 0.002;
const JUMP_V = 0.56;
const START_SPEED = 0.3;
const MAX_SPEED = 0.78;
/** Points = distance / this; at top speed it stays under the 28 points a second the server believes. */
const POINTS_PER_PX = 1 / 30;

const PLAYER_KEY = "selfrun-game-player";
const NAME_KEY = "selfrun-game-name";
const BEST_KEY = "selfrun-game-best";

const pad = (n: number) => String(n).padStart(5, "0");

function readStore(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStore(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // private mode: the game still works, just without a remembered nickname / best
  }
}

/** A CSS colour (a theme variable or any colour) resolved to something a canvas can paint with. */
function resolveColor(el: HTMLElement, value: string, fallback: string): string {
  const probe = document.createElement("span");
  probe.style.color = fallback;
  probe.style.color = value;
  el.appendChild(probe);
  const out = getComputedStyle(probe).color;
  probe.remove();
  return out || fallback;
}

interface Obstacle {
  x: number;
  w: number;
  h: number;
}
interface Cloud {
  x: number;
  y: number;
  r: number;
  s: number;
}

export default function RunnerGame({ page, code }: { page: "404" | "no-workspace" | "maintenance"; /** Big faint lettering behind the game ("404", "BRB"). */ code?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const api = useRef<{ jump: (down?: boolean) => void; duck: (on: boolean) => void; pause: () => void; reset: () => void } | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [score, setScore] = useState(0);
  const [state, setState] = useState<State>({ best: 0, plays: 0, top: [] });
  const [newBest, setNewBest] = useState(false);
  const [name, setName] = useState("");
  const player = useRef("");
  const nameRef = useRef("");
  nameRef.current = name;

  // Player identity and the leaderboard of this address.
  useEffect(() => {
    let id = readStore(PLAYER_KEY);
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      id = crypto.randomUUID();
      writeStore(PLAYER_KEY, id);
    }
    player.current = id;
    setName(readStore(NAME_KEY) ?? "");
    const localBest = Number(readStore(BEST_KEY) ?? 0) || 0;
    setState((s) => ({ ...s, best: localBest }));
    const ctl = new AbortController();
    fetch(`/api/game?player=${id}`, { signal: ctl.signal, cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<State>) : null))
      .then((d) => d && setState({ best: Math.max(d.best, localBest), plays: d.plays, top: d.top }))
      .catch(() => {});
    return () => ctl.abort();
  }, []);

  const save = useCallback(
    (finalScore: number, durationMs: number) => {
      if (finalScore <= 0 || durationMs < 800) return;
      fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: player.current, name: nameRef.current, score: finalScore, durationMs, page }),
      })
        .then((r) => r.json() as Promise<{ ok: boolean; state?: State; newBest?: boolean }>)
        .then((d) => {
          if (d.ok && d.state) {
            setState((s) => ({ ...d.state!, best: Math.max(d.state!.best, s.best) }));
            if (d.newBest) setNewBest(true);
          }
        })
        .catch(() => {});
    },
    [page],
  );

  // The game itself.
  useEffect(() => {
    const cv = canvas.current;
    const box = wrap.current;
    if (!cv || !box) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    let width = 600;
    let H = H_DESKTOP;
    let dpr = 1;
    const resize = () => {
      width = Math.max(280, Math.floor(box.clientWidth));
      H = Math.max(120, Math.min(width < 560 ? H_MOBILE : H_DESKTOP, window.innerHeight - 410));
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.floor(width * dpr);
      cv.height = Math.floor(H * dpr);
      cv.style.width = `${width}px`;
      cv.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    };

    let colors = { primary: "#4f46e5", fg: "#111827", muted: "#9ca3af", border: "#e5e7eb", card: "#ffffff", skin: "#ffd9b8", jeans: "#334155" };
    const loadColors = () => {
      colors = {
        primary: resolveColor(box, "var(--primary)", colors.primary),
        fg: resolveColor(box, "var(--foreground)", colors.fg),
        muted: resolveColor(box, "var(--muted-foreground)", colors.muted),
        border: resolveColor(box, "var(--border)", colors.border),
        card: resolveColor(box, "var(--card)", colors.card),
        skin: "#ffd9b8",
        jeans: "#334155",
      };
    };

    let ph: Phase = "idle";
    let y = 0;
    let vy = 0;
    let ducking = false;
    let speed = START_SPEED;
    let dist = 0;
    let frame = 0;
    let obstacles: Obstacle[] = [];
    let clouds: Cloud[] = [];
    let nextGap = 380;
    let last = 0;
    let startedAt = 0;
    let raf = 0;
    let endedAt = 0;
    let shown = 0;
    let best = Number(readStore(BEST_KEY) ?? 0) || 0;
    let hit = false;

    const setPh = (p: Phase) => {
      ph = p;
      setPhase(p);
    };

    const reset = () => {
      y = 0;
      vy = 0;
      speed = START_SPEED;
      dist = 0;
      frame = 0;
      obstacles = [];
      nextGap = 420;
      clouds = Array.from({ length: 4 }, (_, i) => ({ x: (i + 1) * (width / 4), y: 18 + Math.random() * (H * 0.28), r: 14 + Math.random() * 14, s: 0.04 + Math.random() * 0.05 }));
      shown = 0;
      hit = false;
      setScore(0);
      setNewBest(false);
    };

    const spawn = () => {
      const count = Math.random() < 0.28 ? 2 : 1;
      const h = [26, 34, 44][Math.floor(Math.random() * 3)];
      const w = 24 + Math.floor(Math.random() * 8);
      obstacles.push({ x: width + 20, w: w * count + (count - 1) * 4, h });
      const airtime = (2 * JUMP_V) / GRAVITY;
      nextGap = airtime * speed * (1.05 + Math.random() * 1.1) + 90;
    };

    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    const finish = () => {
      stop();
      endedAt = performance.now();
      const final = Math.floor(dist * POINTS_PER_PX);
      if (final > best) {
        best = final;
        writeStore(BEST_KEY, String(final));
        setState((s) => ({ ...s, best: final }));
      }
      setScore(final);
      setPh("over");
      save(final, Math.round(endedAt - startedAt));
      draw();
    };

    const step = (t: number) => {
      const dt = Math.min(40, t - last);
      last = t;
      frame += dt;
      speed = Math.min(MAX_SPEED, speed + dt * 0.0000055);
      dist += speed * dt;
      // the runner
      if (y > 0 || vy > 0) {
        vy -= GRAVITY * (ducking ? 3 : 1) * dt;
        y += vy * dt;
        if (y <= 0) {
          y = 0;
          vy = 0;
        }
      }
      // the world
      for (const o of obstacles) o.x -= speed * dt;
      obstacles = obstacles.filter((o) => o.x + o.w > -10);
      for (const c of clouds) {
        c.x -= c.s * dt * (0.4 + speed);
        if (c.x < -40) {
          c.x = width + 40;
          c.y = 16 + Math.random() * (H * 0.28);
        }
      }
      const lastO = obstacles[obstacles.length - 1];
      if (!lastO || width - (lastO.x + lastO.w) > nextGap) spawn();
      // collisions (a little forgiving)
      const pw = 16;
      const ph2 = 34;
      const px = PX + 6;
      for (const o of obstacles) {
        if (px + pw > o.x + 4 && px < o.x + o.w - 4 && y < o.h - 6 && ph2 > 0) hit = true;
      }
      const s = Math.floor(dist * POINTS_PER_PX);
      if (s !== shown) {
        shown = s;
        setScore(s);
      }
      draw();
      if (hit) return finish();
      raf = requestAnimationFrame(step);
    };

    function draw() {
      const gy = H - GROUND;
      ctx!.clearRect(0, 0, width, H);
      if (code) {
        ctx!.save();
        ctx!.globalAlpha = 0.07;
        ctx!.fillStyle = colors.fg;
        ctx!.textAlign = "center";
        ctx!.font = `900 ${Math.round(H * 0.72)}px ui-sans-serif, system-ui, sans-serif`;
        ctx!.fillText(code, width / 2, H * 0.74);
        ctx!.restore();
      }
      // clouds
      ctx!.fillStyle = colors.border;
      for (const c of clouds) {
        ctx!.beginPath();
        ctx!.ellipse(c.x, c.y, c.r * 1.6, c.r * 0.6, 0, 0, Math.PI * 2);
        ctx!.ellipse(c.x - c.r * 0.7, c.y + 2, c.r, c.r * 0.5, 0, 0, Math.PI * 2);
        ctx!.fill();
      }
      // ground
      ctx!.strokeStyle = colors.border;
      ctx!.lineWidth = 2;
      ctx!.beginPath();
      ctx!.moveTo(0, gy + 0.5);
      ctx!.lineTo(width, gy + 0.5);
      ctx!.stroke();
      ctx!.strokeStyle = colors.primary;
      ctx!.globalAlpha = 0.35;
      ctx!.lineWidth = 2;
      ctx!.setLineDash([14, 16]);
      ctx!.lineDashOffset = -(dist % 30);
      ctx!.beginPath();
      ctx!.moveTo(0, gy + 8);
      ctx!.lineTo(width, gy + 8);
      ctx!.stroke();
      ctx!.setLineDash([]);
      ctx!.globalAlpha = 1;
      // crates
      for (const o of obstacles) {
        const top = gy - o.h;
        ctx!.fillStyle = colors.card;
        ctx!.strokeStyle = colors.primary;
        ctx!.lineWidth = 2.5;
        ctx!.beginPath();
        ctx!.roundRect(o.x, top, o.w, o.h, 4);
        ctx!.fill();
        ctx!.stroke();
        ctx!.globalAlpha = 0.5;
        ctx!.beginPath();
        ctx!.moveTo(o.x + 5, top + 5);
        ctx!.lineTo(o.x + o.w - 5, top + o.h - 5);
        ctx!.moveTo(o.x + o.w - 5, top + 5);
        ctx!.lineTo(o.x + 5, top + o.h - 5);
        ctx!.stroke();
        ctx!.globalAlpha = 1;
      }
      // shadow
      ctx!.fillStyle = colors.fg;
      ctx!.globalAlpha = Math.max(0.05, 0.16 - y / 700);
      ctx!.beginPath();
      ctx!.ellipse(PX + 14, gy + 2, 16 - y / 14, 3, 0, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.globalAlpha = 1;
      // the runner (cap, head, shirt, swinging legs and arms)
      const base = gy - y;
      const swing = ph === "running" && y === 0 ? Math.sin(frame / 70) : 0.35;
      ctx!.lineCap = "round";
      ctx!.strokeStyle = colors.jeans;
      ctx!.lineWidth = 6;
      const leg = (a: number) => {
        ctx!.beginPath();
        ctx!.moveTo(PX + 14, base - 14);
        ctx!.lineTo(PX + 14 + a * 9, base - 1);
        ctx!.stroke();
      };
      leg(swing);
      leg(-swing);
      ctx!.strokeStyle = colors.primary;
      ctx!.lineWidth = 11;
      ctx!.beginPath();
      ctx!.moveTo(PX + 14, base - 17);
      ctx!.lineTo(PX + 16, base - 31);
      ctx!.stroke();
      ctx!.strokeStyle = colors.skin;
      ctx!.lineWidth = 4.5;
      ctx!.beginPath();
      ctx!.moveTo(PX + 15, base - 28);
      ctx!.lineTo(PX + 15 + (y > 0 ? -8 : -swing * 8), base - 20 + (y > 0 ? -8 : 0));
      ctx!.stroke();
      ctx!.fillStyle = colors.skin;
      ctx!.beginPath();
      ctx!.arc(PX + 18, base - 40, 8, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.fillStyle = colors.primary;
      ctx!.beginPath();
      ctx!.arc(PX + 18, base - 41, 8.5, Math.PI, Math.PI * 2);
      ctx!.fill();
      ctx!.fillRect(PX + 18, base - 44, 12, 3.5);
      ctx!.fillStyle = colors.fg;
      ctx!.beginPath();
      ctx!.arc(PX + 21, base - 39, 1.6, 0, Math.PI * 2);
      ctx!.fill();
      // score
      ctx!.font = "600 13px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx!.textAlign = "right";
      ctx!.fillStyle = colors.muted;
      ctx!.fillText(`HI ${pad(best)}`, width - 84, 22);
      ctx!.fillStyle = colors.fg;
      ctx!.fillText(pad(shown), width - 14, 22);
      // messages
      ctx!.textAlign = "center";
      if (ph === "idle") {
        ctx!.fillStyle = colors.fg;
        ctx!.font = "700 15px ui-sans-serif, system-ui, sans-serif";
        ctx!.fillText("Press Space or tap to start", width / 2, H * 0.4);
        ctx!.fillStyle = colors.muted;
        ctx!.font = "500 12px ui-sans-serif, system-ui, sans-serif";
        ctx!.fillText("Jump over the crates. It gets faster.", width / 2, H * 0.4 + 22);
      } else if (ph === "over") {
        ctx!.fillStyle = colors.fg;
        ctx!.font = "800 18px ui-sans-serif, system-ui, sans-serif";
        ctx!.fillText("GAME OVER", width / 2, H * 0.36);
        ctx!.fillStyle = colors.muted;
        ctx!.font = "500 12px ui-sans-serif, system-ui, sans-serif";
        ctx!.fillText("Space or tap to play again", width / 2, H * 0.36 + 22);
      } else if (ph === "paused") {
        ctx!.fillStyle = colors.fg;
        ctx!.font = "700 15px ui-sans-serif, system-ui, sans-serif";
        ctx!.fillText("Paused. Press Space or tap to continue", width / 2, H * 0.4);
      }
    }

    const begin = () => {
      loadColors();
      reset();
      startedAt = performance.now();
      last = startedAt;
      setPh("running");
      raf = requestAnimationFrame(step);
    };

    const jump = () => {
      if (ph === "idle") return begin();
      if (ph === "over") {
        if (performance.now() - endedAt > 450) begin();
        return;
      }
      if (ph === "paused") {
        last = performance.now();
        setPh("running");
        raf = requestAnimationFrame(step);
        return;
      }
      if (y === 0 && vy === 0) vy = JUMP_V;
    };
    const pause = () => {
      if (ph !== "running") return;
      stop();
      setPh("paused");
      draw();
    };

    api.current = { jump, duck: (on) => (ducking = on), pause, reset: begin };

    // Pauses on its own when the tab is hidden or the game is scrolled out of view.
    const vis = () => document.hidden && pause();
    document.addEventListener("visibilitychange", vis);
    const io = new IntersectionObserver((e) => e[0] && !e[0].isIntersecting && pause(), { threshold: 0.2 });
    io.observe(cv);
    const ro = new ResizeObserver(resize);
    ro.observe(box);
    window.addEventListener("resize", resize);
    loadColors();
    reset();
    resize();

    return () => {
      stop();
      document.removeEventListener("visibilitychange", vis);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("resize", resize);
      api.current = null;
    };
  }, [save, code]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.code === "Space" || e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
      e.preventDefault();
      api.current?.jump();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      api.current?.duck(true);
    } else if (e.key === "p" || e.key === "P" || e.key === "Escape") api.current?.pause();
  };

  return (
    <section className="game-hero" aria-label="Mini game">
      <div ref={wrap} className="game-stage">
        <canvas
          ref={canvas}
          tabIndex={0}
          role="img"
          aria-label={`Mini game: jump over the crates. Score ${score}.`}
          className="game-canvas"
          onKeyDown={onKey}
          onKeyUp={(e) => e.key === "ArrowDown" && api.current?.duck(false)}
          onPointerDown={(e) => {
            e.currentTarget.focus({ preventScroll: true });
            api.current?.jump();
          }}
        />
        {newBest && phase === "over" && <span className="game-newbest">New best!</span>}
      </div>

      <div className="game-bar">
        <div className="flex items-center gap-2">
          <button type="button" className="game-btn game-btn-primary" onClick={() => api.current?.jump()}>
            {phase === "over" ? <RotateCcw className="size-4" /> : <Play className="size-4" />}
            {phase === "idle" ? "Start" : phase === "over" ? "Play again" : phase === "paused" ? "Resume" : "Jump"}
          </button>
          {phase === "running" && <button type="button" className="game-btn" onClick={() => api.current?.pause()}><Pause className="size-4" /> Pause</button>}
        </div>

        <div className="game-top" aria-label="Top scores">
          <span className="game-chip"><Trophy className="size-3" /> Best {pad(state.best)}</span>
          {state.top.slice(0, 3).map((r, i) => (
            <span key={`${r.name}-${i}`} className={cn("game-chip game-chip-soft", r.you && "is-you")}>
              <Medal className="size-3" /> <span className="max-w-[7rem] truncate">{r.name}</span> <b className="tabular-nums">{pad(r.score)}</b>
            </span>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Gamepad2 className="size-3.5 text-primary" />
          <input
            value={name}
            maxLength={16}
            placeholder="Your name"
            aria-label="Your name on the leaderboard"
            onChange={(e) => {
              setName(e.target.value);
              writeStore(NAME_KEY, e.target.value);
            }}
            className="game-input"
          />
        </label>
      </div>
    </section>
  );
}

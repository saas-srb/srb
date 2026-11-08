"use client";

import { useState } from "react";
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  MonitorUp,
  MonitorX,
  Hand,
  Smile,
  Users,
  MessageSquare,
  PhoneOff,
  ChevronUp,
  Check,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { CALL_REACTIONS } from "@/lib/products/huddle-ai/call-constants";
import type { CallMedia } from "@/components/products/huddle-ai/call/useCallMedia";

function Menu({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.14 }}
        className="absolute bottom-full left-1/2 z-50 mb-3 w-64 -translate-x-1/2 rounded-2xl border border-white/10 bg-[#1b1e26]/95 p-1.5 text-sm text-white shadow-2xl backdrop-blur-xl"
      >
        {children}
      </motion.div>
    </>
  );
}

function DevicePicker({
  label,
  devices,
  currentId,
  onPick,
  extra,
}: {
  label: string;
  devices: { deviceId: string; label: string }[];
  currentId: string | undefined;
  onPick: (id: string) => void;
  extra?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="absolute -top-1.5 -right-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`${label} options`}
        className="flex size-[18px] items-center justify-center rounded-full border border-white/20 bg-[#1b1e26] text-white/70 shadow hover:bg-white/20 hover:text-white"
      >
        <ChevronUp className="size-3" />
      </button>
      <Menu open={open} onClose={() => setOpen(false)}>
        <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/40">{label}</p>
        {devices.map((d) => (
          <button
            key={d.deviceId}
            type="button"
            onClick={() => {
              onPick(d.deviceId);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left hover:bg-white/10"
          >
            <Check className={cn("size-4 shrink-0", currentId === d.deviceId ? "text-primary" : "text-transparent")} />
            <span className="truncate">{d.label}</span>
          </button>
        ))}
        {devices.length === 0 && <p className="px-2.5 py-1.5 text-white/40">No devices found</p>}
        {extra}
      </Menu>
    </div>
  );
}

/**
 * `state`:
 *   "on"        feature enabled — subtle translucent (mic on, cam on)
 *   "off"       feature disabled, wants attention — solid light with dark icon
 *   "highlight" toggle active — brand tint (screen sharing, hand up, product open)
 *   "danger"    leave / end
 */
function Ctl({
  state = "on",
  onClick,
  label,
  children,
  wrap,
}: {
  state?: "on" | "off" | "highlight" | "danger";
  onClick?: () => void;
  label: string;
  children: React.ReactNode;
  wrap?: React.ReactNode;
}) {
  return (
    <div className="group/ctl relative">
      <motion.button
        type="button"
        onClick={onClick}
        aria-label={label}
        whileTap={{ scale: 0.9 }}
        className={cn(
          "flex size-11 items-center justify-center rounded-2xl transition-colors",
          state === "danger" && "bg-destructive text-white hover:bg-destructive/90",
          state === "off" && "bg-white text-[#0b0d12] hover:bg-white/90",
          state === "highlight" && "bg-primary text-white hover:bg-primary/90",
          state === "on" && "bg-white/10 text-white hover:bg-white/20"
        )}
      >
        {children}
      </motion.button>
      <span className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/80 px-1.5 py-0.5 text-[11px] text-white opacity-0 transition-opacity group-hover/ctl:opacity-100">
        {label}
      </span>
      {wrap}
    </div>
  );
}

export default function CallControls({
  media,
  sharing,
  handRaised,
  screenShareEnabled,
  showParticipants,
  showChat,
  isHost,
  onToggleShare,
  onToggleHand,
  onReaction,
  onToggleParticipants,
  onToggleChat,
  onLeave,
  onEnd,
}: {
  media: CallMedia;
  sharing: boolean;
  handRaised: boolean;
  screenShareEnabled: boolean;
  showParticipants: boolean;
  showChat: boolean;
  isHost: boolean;
  onToggleShare: () => void;
  onToggleHand: () => void;
  onReaction: (emoji: string) => void;
  onToggleParticipants: () => void;
  onToggleChat: () => void;
  onLeave: () => void;
  onEnd: () => void;
}) {
  const [reactOpen, setReactOpen] = useState(false);

  return (
    <motion.div
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="pointer-events-auto flex items-center gap-2 rounded-[22px] border border-white/10 bg-white/[0.08] px-3 py-2.5 shadow-2xl backdrop-blur-2xl"
    >
      <Ctl
        state={media.micOn ? "on" : "off"}
        onClick={media.toggleMic}
        label={media.micOn ? "Mute" : "Unmute"}
        wrap={
          <DevicePicker
            label="Microphone"
            devices={media.mics}
            currentId={media.micId}
            onPick={media.setMic}
            extra={
              <label className="mt-0.5 flex cursor-pointer items-center gap-2 rounded-xl border-t border-white/10 px-2.5 py-2 text-[13px] hover:bg-white/10">
                <input
                  type="checkbox"
                  checked={media.noiseSuppression}
                  onChange={(e) => media.setNoiseSuppression(e.target.checked)}
                  className="accent-primary"
                />
                Noise suppression
              </label>
            }
          />
        }
      >
        {media.micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
      </Ctl>

      <Ctl
        state={media.camOn ? "on" : "off"}
        onClick={media.toggleCam}
        label={media.camOn ? "Turn off camera" : "Turn on camera"}
        wrap={<DevicePicker label="Camera" devices={media.cams} currentId={media.camId} onPick={media.setCam} />}
      >
        {media.camOn ? <VideoIcon className="size-5" /> : <VideoOff className="size-5" />}
      </Ctl>

      {screenShareEnabled && (
        <Ctl state={sharing ? "highlight" : "on"} onClick={onToggleShare} label={sharing ? "Stop sharing" : "Share screen"}>
          {sharing ? <MonitorX className="size-5" /> : <MonitorUp className="size-5" />}
        </Ctl>
      )}

      <Ctl state={handRaised ? "highlight" : "on"} onClick={onToggleHand} label={handRaised ? "Lower hand" : "Raise hand"}>
        <Hand className="size-5" />
      </Ctl>

      <Ctl
        state={reactOpen ? "highlight" : "on"}
        onClick={() => setReactOpen((v) => !v)}
        label="Reactions"
        wrap={
          <Menu open={reactOpen} onClose={() => setReactOpen(false)}>
            <div className="flex flex-wrap justify-center gap-1 p-1">
              {CALL_REACTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  className="rounded-xl p-1.5 text-2xl transition-transform hover:scale-125"
                  onClick={() => {
                    onReaction(e);
                    setReactOpen(false);
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          </Menu>
        }
      >
        <Smile className="size-5" />
      </Ctl>

      <div className="mx-1 h-7 w-px bg-white/15" />

      <Ctl state={showParticipants ? "highlight" : "on"} onClick={onToggleParticipants} label="Participants">
        <Users className="size-5" />
      </Ctl>
      <Ctl state={showChat ? "highlight" : "on"} onClick={onToggleChat} label="Chat">
        <MessageSquare className="size-5" />
      </Ctl>

      <div className="mx-1 h-7 w-px bg-white/15" />

      <motion.button
        type="button"
        onClick={isHost ? onEnd : onLeave}
        whileTap={{ scale: 0.94 }}
        className="flex h-11 items-center gap-1.5 rounded-2xl bg-destructive px-5 text-sm font-semibold text-white shadow-lg shadow-destructive/25 hover:bg-destructive/90"
      >
        <PhoneOff className="size-4" />
        {isHost ? "End" : "Leave"}
      </motion.button>
    </motion.div>
  );
}

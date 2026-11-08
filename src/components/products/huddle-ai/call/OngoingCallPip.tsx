"use client";

import { motion } from "framer-motion";
import { Phone, Video, Maximize2 } from "lucide-react";

export default function OngoingCallPip({
  title,
  mode,
  onOpen,
}: {
  title: string;
  mode: "audio" | "video";
  onOpen: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed bottom-4 left-1/2 z-[90] flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-green-500/40 bg-green-500/15 px-4 py-2 text-sm font-medium text-green-700 shadow-lg backdrop-blur-md dark:text-green-300"
    >
      <span className="flex size-6 items-center justify-center rounded-full bg-green-500 text-white">
        {mode === "video" ? <Video className="size-3.5" /> : <Phone className="size-3.5" />}
      </span>
      <span className="max-w-[40vw] truncate">In call · {title}</span>
      <span className="flex size-1.5 animate-pulse rounded-full bg-green-500" />
      <Maximize2 className="size-3.5 opacity-70" />
    </motion.button>
  );
}

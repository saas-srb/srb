"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Call, Device } from "@twilio/voice-sdk";

/**
 * The browser softphone (Twilio Voice SDK): joins the call's conference muted so a team member can listen, and can speak after a take-over.
 * The server also mutes this leg inside the conference, so the local mute is a second lock, not the only one.
 */

export interface SoftphoneCredentials {
  callId: string;
  accessToken: string;
  joinToken: string;
  /** Epoch ms. */
  expiresAt: number;
}
export type SoftphoneState = "idle" | "asking-mic" | "connecting" | "listening" | "error";
export interface InputDevice {
  id: string;
  label: string;
}

export function useLiveSoftphone(fetchCredentials: () => Promise<SoftphoneCredentials | string>) {
  const [state, setState] = useState<SoftphoneState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [micMuted, setMicMuted] = useState(true);
  const [devices, setDevices] = useState<InputDevice[]>([]);
  const [deviceId, setDeviceId] = useState("default");
  const [level, setLevel] = useState(0);
  const device = useRef<Device | null>(null);
  const call = useRef<Call | null>(null);
  const fetcher = useRef(fetchCredentials);
  useEffect(() => { fetcher.current = fetchCredentials; });

  const refreshDevices = useCallback(() => {
    const map = device.current?.audio?.availableInputDevices;
    if (!map) return;
    setDevices([...map.entries()].map(([id, d]) => ({ id, label: d.label || "Microphone" })));
  }, []);

  const leave = useCallback(() => {
    call.current?.disconnect();
    device.current?.destroy();
    call.current = null;
    device.current = null;
    setState("idle");
    setMicMuted(true);
    setLevel(0);
  }, []);

  const join = useCallback(async () => {
    if (device.current) return;
    setError(null);
    setState("asking-mic");
    try {
      // Ask for the microphone first: a refusal is explained here instead of failing inside the SDK.
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
      probe.getTracks().forEach((t) => t.stop());
    } catch (e) {
      setState("error");
      setError(e instanceof DOMException && e.name === "NotFoundError" ? "No microphone was found. Plug one in to listen to and join calls." : "The browser blocked the microphone. Allow microphone access for this site in the address bar, then try again.");
      return;
    }
    setState("connecting");
    const creds = await fetcher.current();
    if (typeof creds === "string") {
      setState("error");
      setError(creds);
      return;
    }
    try {
      const { Device: TwilioDevice } = await import("@twilio/voice-sdk");
      const d = new TwilioDevice(creds.accessToken, { closeProtection: true });
      device.current = d;
      d.on("tokenWillExpire", () => {
        void fetcher.current().then((fresh) => { if (typeof fresh !== "string") d.updateToken(fresh.accessToken); });
      });
      d.on("error", (e: { message?: string }) => { setError(e.message ?? "The phone connection had a problem."); });
      d.audio?.on("deviceChange", refreshDevices);
      const c = await d.connect({ params: { joinToken: creds.joinToken, callId: creds.callId } });
      call.current = c;
      c.mute(true);
      c.on("accept", () => { setState("listening"); refreshDevices(); });
      c.on("volume", (inputVolume: number) => setLevel(inputVolume));
      c.on("disconnect", () => { call.current = null; device.current?.destroy(); device.current = null; setState("idle"); setMicMuted(true); setLevel(0); });
      c.on("error", (e: { message?: string }) => { setState("error"); setError(e.message ?? "The call connection failed."); });
      refreshDevices();
    } catch (e) {
      device.current?.destroy();
      device.current = null;
      setState("error");
      setError(e instanceof Error ? e.message : "Couldn't connect your browser to the call.");
    }
  }, [refreshDevices]);

  const setMuted = useCallback((muted: boolean) => {
    call.current?.mute(muted);
    setMicMuted(muted);
  }, []);

  const pickDevice = useCallback(async (id: string) => {
    setDeviceId(id);
    try { await device.current?.audio?.setInputDevice(id); } catch { setError("That microphone couldn't be used."); }
  }, []);

  useEffect(() => () => { call.current?.disconnect(); device.current?.destroy(); }, []);

  return { state, error, micMuted, devices, deviceId, level, join, leave, setMuted, pickDevice };
}

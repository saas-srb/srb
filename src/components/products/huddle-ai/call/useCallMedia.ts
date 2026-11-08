"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Local media lifecycle for a call: getUserMedia, device enumeration + switching,
 * mute / camera toggles, and a speaking detector fed off the local audio track.
 * Device choices persist to localStorage.
 */

const LS_KEY = "messenger.call.devices";

export interface DeviceInfo {
  deviceId: string;
  label: string;
}

interface StoredDevices {
  micId?: string;
  camId?: string;
  speakerId?: string;
  noiseSuppression?: boolean;
}

function readStored(): StoredDevices {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "{}") as StoredDevices;
  } catch {
    return {};
  }
}
function writeStored(patch: StoredDevices) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ ...readStored(), ...patch }));
  } catch {
    /* ignore */
  }
}

export interface CallMedia {
  stream: MediaStream | null;
  error: string | null;
  micOn: boolean;
  camOn: boolean;
  speaking: boolean;
  mics: DeviceInfo[];
  cams: DeviceInfo[];
  speakers: DeviceInfo[];
  micId: string | undefined;
  camId: string | undefined;
  speakerId: string | undefined;
  noiseSuppression: boolean;
  start: (opts?: { video?: boolean }) => Promise<MediaStream | null>;
  stop: () => void;
  toggleMic: () => void;
  toggleCam: () => Promise<void>;
  setMic: (id: string) => Promise<void>;
  setCam: (id: string) => Promise<void>;
  setSpeaker: (id: string) => void;
  setNoiseSuppression: (on: boolean) => Promise<void>;
}

export function useCallMedia(wantVideo: boolean): CallMedia {
  const stored = typeof window !== "undefined" ? readStored() : {};
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(wantVideo);
  const [speaking, setSpeaking] = useState(false);
  const [mics, setMics] = useState<DeviceInfo[]>([]);
  const [cams, setCams] = useState<DeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<DeviceInfo[]>([]);
  const [micId, setMicId] = useState<string | undefined>(stored.micId);
  const [camId, setCamId] = useState<string | undefined>(stored.camId);
  const [speakerId, setSpeakerId] = useState<string | undefined>(stored.speakerId);
  const [noiseSuppression, setNS] = useState<boolean>(stored.noiseSuppression ?? true);

  const streamRef = useRef<MediaStream | null>(null);
  const analyserRAF = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const wantVideoRef = useRef(wantVideo);

  const refreshDevices = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const map = (kind: MediaDeviceKind) =>
        list
          .filter((d) => d.kind === kind && d.deviceId)
          .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `${kind} ${i + 1}` }));
      setMics(map("audioinput"));
      setCams(map("videoinput"));
      setSpeakers(map("audiooutput"));
    } catch {
      /* ignore */
    }
  }, []);

  const attachAnalyser = useCallback((s: MediaStream) => {
    if (analyserRAF.current) cancelAnimationFrame(analyserRAF.current);
    audioCtxRef.current?.close().catch(() => {});
    const track = s.getAudioTracks()[0];
    if (!track) return;
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(new MediaStream([track]));
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      let quietFrames = 0;
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        const loud = rms > 0.04 && track.enabled;
        if (loud) {
          quietFrames = 0;
          setSpeaking(true);
        } else if (++quietFrames > 12) {
          setSpeaking(false);
        }
        analyserRAF.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      /* analyser unavailable */
    }
  }, []);

  const buildConstraints = useCallback(
    (video: boolean): MediaStreamConstraints => ({
      audio: {
        deviceId: micId ? { exact: micId } : undefined,
        noiseSuppression,
        echoCancellation: true,
        autoGainControl: true,
      },
      video: video
        ? { deviceId: camId ? { exact: camId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 } }
        : false,
    }),
    [micId, camId, noiseSuppression]
  );

  const start = useCallback(
    async (opts?: { video?: boolean }) => {
      const video = opts?.video ?? wantVideoRef.current;
      try {
        setError(null);
        const s = await navigator.mediaDevices.getUserMedia(buildConstraints(video));
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = s;
        s.getAudioTracks().forEach((t) => (t.enabled = micOn));
        setStream(s);
        setCamOn(video && s.getVideoTracks().length > 0);
        attachAnalyser(s);
        await refreshDevices();
        return s;
      } catch (e) {
        const name = e instanceof Error ? e.name : "";
        setError(
          name === "NotAllowedError"
            ? "Camera / microphone permission was denied."
            : name === "NotFoundError"
              ? "No camera or microphone found."
              : "Could not access your camera or microphone."
        );
        return null;
      }
    },
    [buildConstraints, micOn, attachAnalyser, refreshDevices]
  );

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
    if (analyserRAF.current) cancelAnimationFrame(analyserRAF.current);
    audioCtxRef.current?.close().catch(() => {});
  }, []);

  const toggleMic = useCallback(() => {
    const track = streamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setMicOn(track.enabled);
    }
  }, []);

  const toggleCam = useCallback(async () => {
    const s = streamRef.current;
    if (!s) return;
    const track = s.getVideoTracks()[0];
    if (track && track.readyState === "live") {
      track.stop();
      s.removeTrack(track);
      setCamOn(false);
      return;
    }
    try {
      const cam = await navigator.mediaDevices.getUserMedia({ video: buildConstraints(true).video });
      const newTrack = cam.getVideoTracks()[0];
      if (newTrack) {
        s.addTrack(newTrack);
        setCamOn(true);
      }
    } catch {
      setError("Could not turn the camera on.");
    }
  }, [buildConstraints]);

  const setMic = useCallback(
    async (id: string) => {
      setMicId(id);
      writeStored({ micId: id });
      await start({ video: camOn });
    },
    [start, camOn]
  );
  const setCam = useCallback(
    async (id: string) => {
      setCamId(id);
      writeStored({ camId: id });
      if (camOn) await start({ video: true });
    },
    [start, camOn]
  );
  const setSpeaker = useCallback((id: string) => {
    setSpeakerId(id);
    writeStored({ speakerId: id });
  }, []);
  const setNoiseSuppression = useCallback(
    async (on: boolean) => {
      setNS(on);
      writeStored({ noiseSuppression: on });
      await start({ video: camOn });
    },
    [start, camOn]
  );

  useEffect(() => {
    wantVideoRef.current = wantVideo;
  }, [wantVideo]);

  useEffect(() => {
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (analyserRAF.current) cancelAnimationFrame(analyserRAF.current);
      audioCtxRef.current?.close().catch(() => {});
    };
  }, [refreshDevices]);

  return {
    stream,
    error,
    micOn,
    camOn,
    speaking,
    mics,
    cams,
    speakers,
    micId,
    camId,
    speakerId,
    noiseSuppression,
    start,
    stop,
    toggleMic,
    toggleCam,
    setMic,
    setCam,
    setSpeaker,
    setNoiseSuppression,
  };
}

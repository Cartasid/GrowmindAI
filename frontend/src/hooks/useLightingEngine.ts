import { useEffect, useState } from "react";
import { apiUrl, wsUrl } from "../api";

export interface LightingSpectrum {
  blue: number;
  red: number;
  far_red: number;
  uva: number;
  boost: number;
}

export interface LightingTargets {
  blue_pct: number;
  red_pct: number;
  boost_pct: number;
}

export interface LightingEngine {
  current_spectrum: LightingSpectrum;
  target_spectrum: LightingTargets;
  autopilot: boolean;
}

interface LightingPayload {
  lighting_engine: LightingEngine;
}

const DEFAULT_LIGHTING: LightingPayload = {
  lighting_engine: {
    current_spectrum: {
      blue: 0,
      red: 0,
      far_red: 0,
      uva: 0,
      boost: 0
    },
    target_spectrum: {
      blue_pct: 0,
      red_pct: 0,
      boost_pct: 0
    },
    autopilot: false
  }
};

function normalizePayload(payload: Partial<LightingPayload> | null | undefined): LightingPayload {
  if (!payload || !payload.lighting_engine) {
    return DEFAULT_LIGHTING;
  }

  const engine = payload.lighting_engine;
  const current = engine.current_spectrum || DEFAULT_LIGHTING.lighting_engine.current_spectrum;
  const target = engine.target_spectrum || DEFAULT_LIGHTING.lighting_engine.target_spectrum;

  const coerce = (value: unknown): number => {
    const maybe = typeof value === "string" ? value.replace(",", ".") : value;
    const num = Number(maybe);
    return Number.isFinite(num) ? num : 0;
  };

  return {
    lighting_engine: {
      current_spectrum: {
        blue: coerce(current.blue),
        red: coerce(current.red),
        far_red: coerce(current.far_red),
        uva: coerce(current.uva),
        boost: coerce(current.boost)
      },
      target_spectrum: {
        blue_pct: coerce(target.blue_pct),
        red_pct: coerce(target.red_pct),
        boost_pct: coerce(target.boost_pct)
      },
      autopilot: Boolean(engine.autopilot)
    }
  };
}

type LightingStatus = "idle" | "loading" | "ready" | "error";
type ConnectionStatus = "connected" | "reconnecting" | "error";

export const useLightingEngine = () => {
  const [data, setData] = useState<LightingPayload>(DEFAULT_LIGHTING);
  const [status, setStatus] = useState<LightingStatus>("loading");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("reconnecting");

  useEffect(() => {
    let isMounted = true;
    let socket: WebSocket | null = null;
    let reconnectAttempts = 0;
    const maxReconnectDelay = 60000; // 60 seconds max
    const baseReconnectDelay = 3000; // 3 seconds base

    const fetchInitial = async () => {
      try {
        const res = await fetch(apiUrl("/api/dashboard"));
        if (!res.ok) throw new Error("Failed to fetch dashboard");
        const json = await res.json();
        if (!isMounted) return;
        setData(normalizePayload(json));
        setStatus("ready");
        setConnectionStatus("connected");
      } catch (error) {
        console.error("Lighting fetch error", error);
        if (isMounted) {
          setStatus((prevStatus: LightingStatus) => (prevStatus === "ready" ? "ready" : "error"));
          setConnectionStatus("error");
        }
      }
    };

    const connectWebSocket = () => {
      socket = new WebSocket(wsUrl("/ws/lighting"));

      socket.onopen = () => {
        // Reset reconnect attempts on successful connection
        reconnectAttempts = 0;
        if (isMounted) setConnectionStatus("connected");
      };

      socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed?.lighting_engine && isMounted) {
            setData(normalizePayload(parsed));
            setStatus("ready");
          }
        } catch (error) {
          console.error("Lighting websocket parse error", error);
        }
      };

      socket.onclose = () => {
        if (!isMounted) return;
        setConnectionStatus("reconnecting");
        // Exponential backoff with max delay
        reconnectAttempts++;
        const delay = Math.min(
          baseReconnectDelay * Math.pow(2, reconnectAttempts - 1),
          maxReconnectDelay
        );
        setTimeout(connectWebSocket, delay);
      };

      socket.onerror = () => {
        if (isMounted) setConnectionStatus("error");
        socket?.close();
      };
    };

    fetchInitial();
    connectWebSocket();

    return () => {
      isMounted = false;
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
  }, []);

  return {
    lightingEngine: data.lighting_engine,
    status,
    connectionStatus
  };
};

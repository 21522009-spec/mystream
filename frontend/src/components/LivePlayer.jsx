import { useEffect, useMemo, useRef, useState } from "react";
import Hls from "hls.js";
import SrsSDK from "../lib/srs.sdk";

/**
 * LivePlayer:
 * - Try WebRTC (WHEP) first
 * - If WebRTC hangs/fails (common with Docker+UDP on Windows), fallback to HLS
 * - Avoid React StrictMode double-effect + double play() issues
 */
export default function LivePlayer({ srsHost, streamKey }) {
  const videoRef = useRef(null);
  const runRef = useRef(0);
  const playerRef = useRef(null);
  const hlsRef = useRef(null);

  const [mode, setMode] = useState("webrtc"); // webrtc | hls
  const [status, setStatus] = useState("idle"); // idle | connecting | playing | error
  const [error, setError] = useState("");
  const [ice, setIce] = useState("");
  const [isMuted, setIsMuted] = useState(true);

  const host =
    (srsHost && srsHost.trim()) ||
    process.env.REACT_APP_SRS_HOST ||
    window.location.hostname ||
    "localhost";

  // Local dev: http is ok on localhost
  const schema = process.env.REACT_APP_SRS_SCHEMA || "http";

  // IMPORTANT: Đừng tự nhét eip khi test 1 máy.
  // Nếu bạn đã từng set REACT_APP_RTC_EIP thì hãy xóa/để trống.
  const rtcEip = (process.env.REACT_APP_RTC_EIP || "").trim();
  const eipQuery = rtcEip ? `&eip=${encodeURIComponent(rtcEip)}` : "";

  const whepUrl = useMemo(() => {
    const sk = encodeURIComponent(streamKey || "");
    return `${schema}://${host}:1985/rtc/v1/whep/?app=live&stream=${sk}${eipQuery}`;
  }, [schema, host, streamKey, eipQuery]);

  const hlsUrl = useMemo(() => {
    const sk = encodeURIComponent(streamKey || "");
    // HLS path theo SRS: http://host:8080/<app>/<stream>.m3u8 (app=live)
    return `${schema}://${host}:8080/live/${sk}.m3u8`;
  }, [schema, host, streamKey]);

  const cleanup = () => {
    try {
      playerRef.current?.close?.();
    } catch {}
    playerRef.current = null;

    try {
      hlsRef.current?.destroy?.();
    } catch {}
    hlsRef.current = null;

    const v = videoRef.current;
    if (v) {
      try {
        v.pause();
        v.srcObject = null;
        v.removeAttribute("src");
        v.load();
      } catch {}
    }
  };

  const safeVideoPlay = async () => {
    const v = videoRef.current;
    if (!v) return;

    try {
      v.muted = true;
      v.playsInline = true;
      await v.play();
    } catch (e) {
      // play() bị interrupt do load mới -> bỏ qua
      const msg = String(e?.message || "");
      if (
        e?.name === "AbortError" ||
        msg.includes("interrupted by a new load request")
      ) {
        return;
      }
      throw e;
    }
  };

  const withTimeout = (p, ms, label) =>
    Promise.race([
      p,
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error(label || `Timeout ${ms}ms`)), ms)
      ),
    ]);

  const startHls = async (myRun) => {
    const v = videoRef.current;
    if (!v) return;

    setMode("hls");
    setIce("");
    setStatus("connecting");
    setError("");

    // Native HLS (Safari) hoặc hls.js
    if (v.canPlayType("application/vnd.apple.mpegurl")) {
      v.src = hlsUrl;
      await safeVideoPlay();
      if (runRef.current === myRun) setStatus("playing");
      return;
    }

    if (!Hls.isSupported()) {
      setStatus("error");
      setError("Trình duyệt không hỗ trợ HLS.js");
      return;
    }

    const hls = new Hls({
      lowLatencyMode: true,
      enableWorker: true,
    });
    hlsRef.current = hls;

    hls.on(Hls.Events.ERROR, (_, data) => {
      if (runRef.current !== myRun) return;
      // Lỗi nhẹ có thể recover
      if (data?.fatal) {
        setStatus("error");
        setError(`HLS fatal: ${data?.details || "unknown"}`);
      }
    });

    hls.loadSource(hlsUrl);
    hls.attachMedia(v);

    // Chờ manifest rồi play
    hls.on(Hls.Events.MANIFEST_PARSED, async () => {
      if (runRef.current !== myRun) return;
      try {
        await safeVideoPlay();
        setStatus("playing");
      } catch (e) {
        setStatus("error");
        setError(String(e?.message || e));
      }
    });
  };

  const startWebrtc = async (myRun) => {
    setMode("webrtc");
    setStatus("connecting");
    setError("");
    setIce("");

    const sdk = new SrsSDK.SrsRtcWhipWhepAsync();
    playerRef.current = sdk;

    // ICE state debug
    if (sdk.pc) {
      sdk.pc.oniceconnectionstatechange = () => {
        if (runRef.current !== myRun) return;
        setIce(sdk.pc.iceConnectionState || "");
      };
      sdk.pc.onconnectionstatechange = () => {
        if (runRef.current !== myRun) return;
        // optional log
      };
    }

    // Attach stream early
    const v = videoRef.current;
    if (v && v.srcObject !== sdk.stream) v.srcObject = sdk.stream;

    // Khi có track -> play
    sdk.ontrack = async () => {
      if (runRef.current !== myRun) return;
      try {
        await safeVideoPlay();
      } catch {}
    };

    // CỰC QUAN TRỌNG: ép timeout bên ngoài, để không bao giờ kẹt “connecting”
    await withTimeout(sdk.play(whepUrl), 6000, "WHEP timeout (6s)");

    if (runRef.current !== myRun) return;

    await safeVideoPlay();
    setStatus("playing");
  };

  const start = async () => {
    if (!streamKey) return;
    const myRun = ++runRef.current;

    cleanup();
    setStatus("connecting");
    setError("");

    try {
      // 1) Try WebRTC
      await startWebrtc(myRun);
    } catch (e) {
      if (runRef.current !== myRun) return;

      // WebRTC fail -> fallback HLS
      const msg = String(e?.message || e);
      console.warn("[LivePlayer] WebRTC failed, fallback HLS:", msg);
      try {
        cleanup();
        await startHls(myRun);
      } catch (e2) {
        if (runRef.current !== myRun) return;
        setStatus("error");
        setError(String(e2?.message || e2));
      }
    }
  };

  const stop = () => {
    runRef.current++;
    cleanup();
    setStatus("idle");
    setError("");
    setIce("");
  };

  const toggleMute = async () => {
    const v = videoRef.current;
    if (!v) return;
    const next = !isMuted;
    setIsMuted(next);
    v.muted = next;
    try {
      await v.play();
    } catch {}
  };

  useEffect(() => {
    if (!streamKey) {
      stop();
      return;
    }
    start();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamKey, host]);

  const btn = (color) => ({
    padding: "6px 12px",
    borderRadius: 999,
    border: "1px solid rgba(2,6,23,0.14)",
    background: "rgba(255,255,255,0.92)",
    cursor: "pointer",
    fontWeight: 800,
    color,
  });

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        style={{ width: "100%", height: "100%", display: "block", background: "black" }}
      />

      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: 14,
          transform: "translateX(-50%)",
          display: "flex",
          gap: 10,
          zIndex: 5,
          padding: "10px 12px",
          borderRadius: 999,
          background: "rgba(255,255,255,0.78)",
          border: "1px solid rgba(2,6,23,0.10)",
          boxShadow: "0 10px 30px rgba(2,6,23,0.18)",
          backdropFilter: "blur(8px)",
        }}
      >
        <button
          onClick={start}
          disabled={!streamKey || status === "connecting" || status === "playing"}
          style={{
            ...btn("#0ea5e9"),
            opacity: !streamKey || status !== "idle" ? 0.55 : 1,
          }}
        >
          {status === "connecting" ? "Đang kết nối..." : "Xem"}
        </button>

        <button onClick={stop} style={btn("#ef4444")}>
          Dừng
        </button>

        <button
          onClick={toggleMute}
          disabled={status !== "playing"}
          style={{
            ...btn("#92400e"),
            opacity: status !== "playing" ? 0.55 : 1,
          }}
        >
          {isMuted ? "Bật tiếng" : "Tắt tiếng"}
        </button>
      </div>

      {/* debug strip */}
      <div
        style={{
          position: "absolute",
          left: 10,
          bottom: 10,
          right: 10,
          padding: 8,
          borderRadius: 12,
          background: "rgba(255,255,255,0.85)",
          border: "1px solid rgba(2,6,23,0.10)",
          fontSize: 12,
          color: "#0f172a",
        }}
      >
        <div>
          Mode: <b>{mode}</b> | Status: <b>{status}</b>{" "}
          {ice ? (
            <>
              | ICE: <b>{ice}</b>
            </>
          ) : null}
        </div>
        <div style={{ opacity: 0.75 }}>
          WHEP: {whepUrl}
          <br />
          HLS: {hlsUrl}
        </div>
        {status === "error" && (
          <div style={{ marginTop: 6, color: "#991b1b" }}>Lỗi: {error}</div>
        )}
      </div>
    </div>
  );
}

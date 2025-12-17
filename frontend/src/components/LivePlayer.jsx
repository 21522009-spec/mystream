// frontend/src/components/LivePlayer.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import SrsSDK from "../lib/srs.sdk";

// Player xem WebRTC (WHEP)
export default function LivePlayer({ srsHost, streamKey }) {
  const videoRef = useRef(null);
  const [player, setPlayer] = useState(null);
  const [status, setStatus] = useState("idle"); // idle|playing|error
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [isMuted, setIsMuted] = useState(true); // autoplay-friendly

  const resolvedHost =
    (srsHost && srsHost.trim()) ||
    process.env.REACT_APP_SRS_HOST ||
    window.location.hostname ||
    "localhost";

  const schema = process.env.REACT_APP_SRS_SCHEMA || "http";

  // Cho phép eip là "ip" hoặc "ip:port"
  const rtcEip = (process.env.REACT_APP_RTC_EIP || "").trim();
  const eipQuery = rtcEip ? `&eip=${encodeURIComponent(rtcEip)}` : "";

  const whepUrl = useMemo(() => {
    return `${schema}://${resolvedHost}:1985/rtc/v1/whep/?app=live&stream=${encodeURIComponent(
      streamKey || ""
    )}${eipQuery}`;
  }, [schema, resolvedHost, streamKey, eipQuery]);

  const attach = async (stream) => {
    if (!videoRef.current || !stream) return;
    videoRef.current.srcObject = stream;

    // Start muted để tránh autoplay bị chặn (đặc biệt tab ẩn danh)
    videoRef.current.muted = true;
    videoRef.current.playsInline = true;

    await videoRef.current.play();
  };

  const stopPlay = () => {
    try {
      if (player) player.close();
    } catch {}
    setPlayer(null);
    setStatus("idle");
    setError("");
    setIsBusy(false);

    if (videoRef.current) {
      try {
        const s = videoRef.current.srcObject;
        videoRef.current.srcObject = null;
        if (s && s.getTracks) s.getTracks().forEach((t) => t.stop());
      } catch {}
    }
  };

  const startPlay = async () => {
    if (!streamKey || isBusy) return;
    setIsBusy(true);
    setError("");

    try {
      if (player) {
        try {
          player.close();
        } catch {}
      }

      const sdk = new SrsSDK.SrsRtcWhipWhepAsync();
      await sdk.play(whepUrl);
      await attach(sdk.stream);

      setPlayer(sdk);
      setStatus("playing");
      setIsMuted(true);
    } catch (e) {
      console.error("[Player] play error:", e);
      setStatus("error");
      setError(e?.message || String(e));
      stopPlay();
    } finally {
      setIsBusy(false);
    }
  };

  const toggleMute = async () => {
    if (!videoRef.current) return;
    const next = !isMuted;
    setIsMuted(next);
    videoRef.current.muted = next;

    try {
      await videoRef.current.play();
    } catch {}
  };

  useEffect(() => {
    if (!streamKey) {
      stopPlay();
      return;
    }
    // Auto-play (muted) khi vào phòng
    startPlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamKey, resolvedHost]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          background: "black",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          display: "flex",
          gap: 8,
          zIndex: 5,
        }}
      >
        <button
          onClick={startPlay}
          disabled={isBusy || !streamKey}
          style={{
            padding: "6px 12px",
            borderRadius: 999,
            border: "none",
            cursor: isBusy ? "default" : "pointer",
          }}
        >
          {isBusy ? "Đang kết nối..." : "Xem"}
        </button>

        <button
          onClick={stopPlay}
          disabled={isBusy}
          style={{
            padding: "6px 12px",
            borderRadius: 999,
            border: "none",
            cursor: isBusy ? "default" : "pointer",
          }}
        >
          Dừng
        </button>

        <button
          onClick={toggleMute}
          disabled={status !== "playing"}
          style={{
            padding: "6px 12px",
            borderRadius: 999,
            border: "none",
            cursor: status !== "playing" ? "not-allowed" : "pointer",
          }}
          title="Autoplay chạy muted; bấm để bật/tắt tiếng"
        >
          {isMuted ? "Bật tiếng" : "Tắt tiếng"}
        </button>
      </div>

      {status === "error" && (
        <div
          style={{
            position: "absolute",
            left: 10,
            right: 10,
            bottom: 10,
            padding: 10,
            borderRadius: 12,
            background: "rgba(2,6,23,0.85)",
            border: "1px solid rgba(251,146,60,0.5)",
            color: "#fb923c",
            fontSize: 12,
            zIndex: 6,
          }}
        >
          Lỗi: {error}
          <div style={{ opacity: 0.85, marginTop: 4 }}>WHEP: {whepUrl}</div>
        </div>
      )}
    </div>
  );
}

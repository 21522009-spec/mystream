// frontend/src/components/LivePlayer.jsx
import { useEffect, useRef, useState } from "react";
import SrsSDK from "../lib/srs.sdk";

// Player xem WebRTC (WHEP)
export default function LivePlayer({ srsHost, streamKey }) {
  const videoRef = useRef(null);
  const [player, setPlayer] = useState(null);
  const [status, setStatus] = useState("idle"); // idle|playing|error
  const [error, setError] = useState("");

  const resolvedHost =
    (srsHost && srsHost.trim()) ||
    process.env.REACT_APP_SRS_HOST ||
    window.location.hostname ||
    "localhost";

  const schema = process.env.REACT_APP_SRS_SCHEMA || "http";

  const rtcEipRaw = process.env.REACT_APP_RTC_EIP || "";
  const rtcEip = rtcEipRaw.replace(/:\d+$/, "");
  const eipQuery = rtcEip ? `&eip=${encodeURIComponent(rtcEip)}` : "";

  const whepUrl = `${schema}://${resolvedHost}:1985/rtc/v1/whep/?app=live&stream=${encodeURIComponent(
    streamKey || ""
  )}${eipQuery}`;

  const attach = async (stream) => {
    if (!videoRef.current || !stream) return;
    videoRef.current.srcObject = stream;
    videoRef.current.muted = false;
    try {
      await videoRef.current.play();
    } catch (e) {
      // autoplay blocked thì người dùng click play 1 lần
      console.warn("[Player] play blocked:", e);
    }
  };

  const stopPlay = () => {
    try {
      if (player) {
        player.close();
        if (player.stream) player.stream.getTracks().forEach((t) => t.stop());
      }
    } catch {}
    setPlayer(null);
    setStatus("idle");
    setError("");
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const startPlay = async () => {
    setError("");
    setStatus("idle");

    try {
      if (!streamKey) throw new Error("Thiếu streamKey/roomCode");

      // dọn player cũ
      stopPlay();

      const sdk = new SrsSDK.SrsRtcWhipWhepAsync();
      await sdk.play(whepUrl);
      await attach(sdk.stream);

      setPlayer(sdk);
      setStatus("playing");
    } catch (e) {
      console.error("[Player] play error:", e);
      setStatus("error");
      setError(e?.message || String(e));
    }
  };

  // Auto play khi đổi room
  useEffect(() => {
    if (!streamKey) {
      stopPlay();
      return;
    }
    startPlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamKey, resolvedHost]);

  useEffect(() => () => stopPlay(), []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        controls={false}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          backgroundColor: "black",
        }}
      />

      {/* Controls nhỏ */}
      <div
        style={{
          position: "absolute",
          left: 12,
          bottom: 12,
          display: "flex",
          gap: 8,
          alignItems: "center",
          zIndex: 6,
        }}
      >
        <button
          onClick={status === "playing" ? stopPlay : startPlay}
          style={{
            borderRadius: 999,
            border: "1px solid rgba(148,163,184,0.6)",
            padding: "6px 10px",
            fontSize: 12,
            cursor: "pointer",
            background: "rgba(15,23,42,0.9)",
            color: "#e5f2ff",
          }}
        >
          {status === "playing" ? "Dừng xem" : "Xem"}
        </button>

        <span style={{ fontSize: 12, opacity: 0.8, color: "#e5f2ff" }}>
          {status === "playing" ? "● Live" : ""}
        </span>
      </div>

      {error && (
        <div
          style={{
            position: "absolute",
            left: 12,
            right: 12,
            bottom: 46,
            padding: "8px 10px",
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

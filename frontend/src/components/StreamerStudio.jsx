// frontend/src/components/StreamerStudio.jsx
import { useEffect, useRef, useState } from "react";
import SrsSDK from "../lib/srs.sdk";

// Studio publish WebRTC (WHIP) + preview + record local (MediaRecorder)
export default function StreamerStudio({
  srsHost,
  streamKey,
  onRecordingReady,
  onUploadRecording, // alias (để tương thích code cũ)
}) {
  const videoRef = useRef(null);

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  const [publisher, setPublisher] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");
  const [isRecording, setIsRecording] = useState(false);

  // thêm 144p
  const [quality, setQuality] = useState("720p");
  const [actualCapture, setActualCapture] = useState("");

  // callback upload blob
  const onBlobReady = onRecordingReady || onUploadRecording;

  const resolvedHost =
    (srsHost && srsHost.trim()) ||
    process.env.REACT_APP_SRS_HOST ||
    window.location.hostname ||
    "localhost";

  const schema = process.env.REACT_APP_SRS_SCHEMA || "http";

  // Cho phép eip là "ip" hoặc "ip:port"
  const rtcEip = (process.env.REACT_APP_RTC_EIP || "").trim();
  const eipQuery = rtcEip ? `&eip=${encodeURIComponent(rtcEip)}` : "";

  const whipUrl = `${schema}://${resolvedHost}:1985/rtc/v1/whip/?app=live&stream=${encodeURIComponent(
    streamKey || ""
  )}${eipQuery}`;

  const attachPreview = async (stream) => {
    if (!videoRef.current || !stream) return;

    videoRef.current.srcObject = stream;
    videoRef.current.muted = true;

    // hiển thị “actual capture” để bạn chụp hình đưa vào báo cáo
    try {
      const vt = stream.getVideoTracks?.()?.[0];
      const s = vt?.getSettings?.();
      if (s?.width && s?.height) {
        const fps = s.frameRate ? `@${Math.round(s.frameRate)}fps` : "";
        setActualCapture(`${s.width}x${s.height}${fps}`);
      } else {
        setActualCapture("");
      }
    } catch {
      setActualCapture("");
    }

    try {
      await videoRef.current.play();
    } catch (e) {
      console.warn("[Studio] preview play blocked:", e);
    }
  };

  function getConstraintsByQuality(q) {
    // Dùng ideal để tránh camera “không hỗ trợ đúng chuẩn” bị fail getUserMedia.
    if (q === "144p") {
      return {
        width: { ideal: 256, max: 426 },
        height: { ideal: 144, max: 240 },
        frameRate: { ideal: 15, max: 20 },
      };
    }
    if (q === "1080p") {
      return {
        width: { ideal: 1920, max: 1920 },
        height: { ideal: 1080, max: 1080 },
        frameRate: { ideal: 30, max: 30 },
      };
    }
    if (q === "480p") {
      return {
        width: { ideal: 854, max: 854 },
        height: { ideal: 480, max: 480 },
        frameRate: { ideal: 30, max: 30 },
      };
    }
    // default 720p
    return {
      width: { ideal: 1280, max: 1280 },
      height: { ideal: 720, max: 720 },
      frameRate: { ideal: 30, max: 30 },
    };
  }

  function startRecording(stream) {
    if (!stream) return;
    if (recorderRef.current) return;

    chunksRef.current = [];

    const candidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];

    const mimeType =
      typeof MediaRecorder !== "undefined"
        ? candidates.find((t) => MediaRecorder.isTypeSupported(t))
        : null;

    const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

    mr.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    mr.onstop = async () => {
      try {
        setIsRecording(false);
        const blob = new Blob(chunksRef.current, {
          type: mr.mimeType || "video/webm",
        });
        chunksRef.current = [];

        if (onBlobReady) await onBlobReady(blob);
      } catch (e) {
        console.error("[Studio] upload/record error:", e);
      } finally {
        recorderRef.current = null;
      }
    };

    mr.start(1000);
    recorderRef.current = mr;
    setIsRecording(true);
  }

  function stopRecording() {
    try {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
    } catch {}
  }

  const startLive = async () => {
    if (isBusy || isLive) return;
    setIsBusy(true);
    setError("");

    try {
      if (!streamKey) throw new Error("Thiếu streamKey/roomCode");

      if (publisher) {
        try {
          publisher.close();
        } catch {}
      }

      const sdk = new SrsSDK.SrsRtcWhipWhepAsync();

      sdk.constraints = {
        audio: true,
        video: getConstraintsByQuality(quality),
      };

      await sdk.publish(whipUrl, {
        camera: true,
        screen: false,
        audio: true,
      });

      await attachPreview(sdk.stream);
      startRecording(sdk.stream);

      setPublisher(sdk);
      setIsLive(true);
    } catch (e) {
      console.error("[Studio] publish error:", e);
      setError(e?.message || String(e));
      setIsLive(false);
      stopRecording();
    } finally {
      setIsBusy(false);
    }
  };

  const stopLive = () => {
    stopRecording();

    try {
      if (publisher) {
        publisher.close();
        if (publisher.stream) publisher.stream.getTracks().forEach((t) => t.stop());
      }
    } catch {}

    setPublisher(null);
    setIsLive(false);
    setError("");
    setActualCapture("");

    if (videoRef.current) videoRef.current.srcObject = null;
  };

  useEffect(() => {
    return () => stopLive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: "var(--bg-card)",
        borderRadius: 16,
        border: "1px solid var(--border-subtle)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 10px 30px rgba(2,6,23,0.06)",
      }}
    >
      <div
        style={{
          padding: "10px 12px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          color: "var(--text-main)",
          fontSize: 16,
          fontWeight: 700,
          backgroundColor: "var(--bg-card)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <span
          style={{
            padding: "2px 8px",
            borderRadius: 999,
            backgroundColor: "#ef4444",
            color: "white",
            fontSize: 11,
            textTransform: "uppercase",
          }}
        >
          LIVE
        </span>

        <span>Studio livestream</span>

        <button
          onClick={isLive ? stopLive : startLive}
          disabled={isBusy}
          style={{
            marginLeft: 10,
            padding: "6px 14px",
            borderRadius: 999,
            border: "1px solid rgba(2,6,23,0.08)",
            cursor: isBusy ? "default" : "pointer",
            background: isLive
              ? "linear-gradient(135deg,#ff395b,#ff974c)"
              : "linear-gradient(135deg,#00aaff,#0080cc)",
            color: isLive ? "#ffffff" : "#04121d",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {isBusy ? "Đang kết nối..." : isLive ? "Dừng livestream" : "Bắt đầu"}
        </button>

        <select
          value={quality}
          disabled={isLive || isBusy}
          onChange={(e) => setQuality(e.target.value)}
          style={{
            marginLeft: 8,
            padding: "6px 10px",
            borderRadius: 999,
            border: "1px solid rgba(2,6,23,0.14)",
            background: "#ffffff",
            color: "var(--text-main)",
            fontSize: 12,
            outline: "none",
            cursor: isLive ? "not-allowed" : "pointer",
          }}
          title="Độ phân giải CAPTURE của người phát"
        >
          <option value="144p">144p</option>
          <option value="480p">480p</option>
          <option value="720p">720p</option>
          <option value="1080p">1080p</option>
        </select>

        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {isRecording ? "● Recording" : ""}
        </span>

        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" }}>
          {actualCapture ? `Capture: ${actualCapture} · ` : ""}
          Host: {resolvedHost} · Key: {streamKey || "—"}
        </span>
      </div>

      <div style={{ flex: 1, backgroundColor: "black" }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          style={{
            width: "100%",
            height: "100%",
            display: "block",
            backgroundColor: "black",
          }}
        />
      </div>

      {error && (
        <div style={{ padding: "10px 12px", color: "#b45309", fontSize: 12 }}>
          Lỗi: {error}
          <div style={{ opacity: 0.85, marginTop: 4, color: "var(--text-muted)" }}>
            WHIP: {whipUrl}
          </div>
        </div>
      )}
    </div>
  );
}

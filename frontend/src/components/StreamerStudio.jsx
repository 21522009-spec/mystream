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
  const [quality, setQuality] = useState("720p");

  // callback upload blob
  const onBlobReady = onRecordingReady || onUploadRecording;

  const resolvedHost =
    (srsHost && srsHost.trim()) ||
    process.env.REACT_APP_SRS_HOST ||
    window.location.hostname ||
    "localhost";

  const schema = process.env.REACT_APP_SRS_SCHEMA || "http";

  // Nếu bạn có NAT/public thì có thể set REACT_APP_RTC_EIP.
  const rtcEipRaw = process.env.REACT_APP_RTC_EIP || "";
  const rtcEip = rtcEipRaw.replace(/:\d+$/, "");
  const eipQuery = rtcEip ? `&eip=${encodeURIComponent(rtcEip)}` : "";

  const whipUrl = `${schema}://${resolvedHost}:1985/rtc/v1/whip/?app=live&stream=${encodeURIComponent(
    streamKey || ""
  )}${eipQuery}`;

  const attachPreview = async (stream) => {
    if (!videoRef.current || !stream) return;
    videoRef.current.srcObject = stream;
    videoRef.current.muted = true;
    try {
      await videoRef.current.play();
    } catch (e) {
      console.warn("[Studio] preview play blocked:", e);
    }
  };

  function getConstraintsByQuality(q) {
    // Lưu ý: đây là độ phân giải khi CAPTURE (người phát).
    // Người xem KHÔNG tự chọn quality được nếu chỉ có 1 stream WebRTC.
    if (q === "1080p") return { width: 1920, height: 1080, frameRate: 30 };
    if (q === "480p") return { width: 854, height: 480, frameRate: 30 };
    return { width: 1280, height: 720, frameRate: 30 }; // default 720p
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

        // Upload về backend
        if (onBlobReady) {
          await onBlobReady(blob);
        }
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
      if (!streamKey) {
        throw new Error("Thiếu streamKey/roomCode");
      }

      // dọn publisher cũ
      if (publisher) {
        try {
          publisher.close();
        } catch {}
      }

      const sdk = new SrsSDK.SrsRtcWhipWhepAsync();

      // Gợi ý cho SDK dùng constraints theo quality
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

      // record local stream => stop sẽ upload
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
    // Stop record trước (để lấy blob)
    stopRecording();

    try {
      if (publisher) {
        publisher.close();
        if (publisher.stream) {
          publisher.stream.getTracks().forEach((t) => t.stop());
        }
      }
    } catch {}

    setPublisher(null);
    setIsLive(false);
    setError("");

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
        backgroundColor: "#020617",
        borderRadius: 16,
        border: "1px solid #1f2937",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "10px 12px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          color: "#f9fafb",
          fontSize: 16,
          fontWeight: 600,
          backgroundColor: "#020617",
          borderBottom: "1px solid #1f2937",
        }}
      >
        <span
          style={{
            padding: "2px 8px",
            borderRadius: 999,
            backgroundColor: "#ef4444",
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
            border: "none",
            cursor: isBusy ? "default" : "pointer",
            background: isLive
              ? "linear-gradient(135deg,#ff395b,#ff974c)"
              : "linear-gradient(135deg,#00aaff,#0080cc)",
            color: "#f9fafb",
            fontSize: 13,
            fontWeight: 600,
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
            border: "1px solid rgba(148,163,184,0.6)",
            background: "rgba(15,23,42,0.9)",
            color: "#e5f2ff",
            fontSize: 12,
            outline: "none",
            cursor: isLive ? "not-allowed" : "pointer",
          }}
          title="Độ phân giải CAPTURE của người phát"
        >
          <option value="480p">480p</option>
          <option value="720p">720p</option>
          <option value="1080p">1080p</option>
        </select>

        <span style={{ fontSize: 12, opacity: 0.85 }}>
          {isRecording ? "● Recording" : ""}
        </span>

        <span style={{ marginLeft: "auto", fontSize: 12, opacity: 0.8 }}>
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
        <div style={{ padding: "10px 12px", color: "#fb923c", fontSize: 12 }}>
          Lỗi: {error}
          <div style={{ opacity: 0.85, marginTop: 4 }}>WHIP: {whipUrl}</div>
        </div>
      )}
    </div>
  );
}

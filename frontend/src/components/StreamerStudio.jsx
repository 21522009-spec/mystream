import { useRef, useState, useEffect } from 'react';
import SrsSDK from '../lib/srs.sdk';

export default function StreamerStudio({ srsHost, streamKey }) {
  const videoRef = useRef(null);

  const [publisher, setPublisher] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState('');

  const resolvedHost =
    (srsHost && srsHost.trim()) ||
    process.env.REACT_APP_SRS_HOST ||
    window.location.hostname ||
    'localhost';

  const schema = process.env.REACT_APP_SRS_SCHEMA || 'http';

  // Nếu có cấu hình RTC_EIP thì thêm eip=... (KHÔNG kèm :8000)
  const rtcEipRaw = process.env.REACT_APP_RTC_EIP || '';
  const rtcEip = rtcEipRaw.replace(/:\d+$/, ''); // lỡ bạn gõ 192.168.x.x:8000 thì tự bỏ port
  const eipQuery = rtcEip ? `&eip=${encodeURIComponent(rtcEip)}` : '';

  const whipUrl = `${schema}://${resolvedHost}:1985/rtc/v1/whip/?app=live&stream=${encodeURIComponent(
    streamKey
  )}${eipQuery}`;

  const attachPreview = async (stream) => {
    if (!videoRef.current || !stream) return;
    videoRef.current.srcObject = stream;
    videoRef.current.muted = true; // tránh echo
    try {
      await videoRef.current.play();
    } catch (e) {
      // autoplay đôi khi bị chặn nếu chưa có gesture, nhưng bạn đã click nút rồi nên thường OK
      console.warn('[Studio] preview play blocked:', e);
    }
  };

  const startLive = async () => {
    if (isBusy || isLive) return;
    setIsBusy(true);
    setError('');

    try {
      // Dọn publisher cũ
      if (publisher) {
        try {
          publisher.close();
        } catch {}
      }

      // Tạo publisher mới
      const sdk = new SrsSDK.SrsRtcWhipWhepAsync();

      // Publish lên SRS (SDK sẽ tự getUserMedia)
      await sdk.publish(whipUrl, {
        camera: true,
        screen: false,
        audio: true,
      });

      // ✅ Preview: lấy local stream từ SDK (đây là phần bạn thiếu)
      await attachPreview(sdk.stream);

      setPublisher(sdk);
      setIsLive(true);
    } catch (e) {
      console.error('[Studio] publish error:', e);
      setError(e?.message || String(e));
      setIsLive(false);
    } finally {
      setIsBusy(false);
    }
  };

  const stopLive = () => {
    try {
      if (publisher) {
        // tắt peerconnection
        publisher.close();

        // tắt camera/mic
        if (publisher.stream) {
          publisher.stream.getTracks().forEach((t) => t.stop());
        }
      }
    } catch {}

    setPublisher(null);
    setIsLive(false);
    setError('');

    if (videoRef.current) videoRef.current.srcObject = null;
  };

  // Cleanup khi unmount
  useEffect(() => {
    return () => stopLive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#020617',
        borderRadius: 12,
        border: '1px solid #111827',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header + nút (đưa lên đây để khỏi bị layout cắt mất) */}
      <div
        style={{
          padding: '10px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          color: '#f9fafb',
          fontSize: 16,
          fontWeight: 600,
          backgroundColor: '#020617',
          borderBottom: '1px solid #111827',
        }}
      >
        <span
          style={{
            padding: '2px 8px',
            borderRadius: 999,
            backgroundColor: '#ef4444',
            fontSize: 11,
            textTransform: 'uppercase',
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
            padding: '6px 14px',
            borderRadius: 999,
            border: 'none',
            cursor: isBusy ? 'default' : 'pointer',
            background: isLive
              ? 'linear-gradient(135deg,#ff395b,#ff974c)'
              : 'linear-gradient(135deg,#00aaff,#0080cc)',
            color: '#f9fafb',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {isBusy ? 'Đang kết nối...' : isLive ? 'Dừng livestream' : 'Bắt đầu'}
        </button>

        <span style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.8 }}>
          Host: {resolvedHost} · Key: {streamKey}
        </span>
      </div>

      {/* Video preview */}
      <div style={{ flex: 1, backgroundColor: 'black' }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            backgroundColor: 'black',
          }}
        />
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '10px 12px', color: '#fb923c', fontSize: 12 }}>
          Lỗi: {error}
          <div style={{ opacity: 0.85, marginTop: 4 }}>
            WHIP: {whipUrl}
          </div>
        </div>
      )}
    </div>
  );
}

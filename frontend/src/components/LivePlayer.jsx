import { useRef, useState, useEffect } from 'react';
import SrsSDK from '../lib/srs.sdk';

export default function LivePlayer({ srsHost, streamKey }) {
  const videoRef = useRef(null);
  const [client, setClient] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | connecting | playing | error
  const [error, setError] = useState('');

  const resolvedHost =
    (srsHost && srsHost.trim()) ||
    process.env.REACT_APP_SRS_HOST ||
    window.location.hostname ||
    'localhost';

  const schema = process.env.REACT_APP_SRS_SCHEMA || 'http';

  const rtcEipRaw = process.env.REACT_APP_RTC_EIP || '';
  const rtcEip = rtcEipRaw.replace(/:\d+$/, '');
  const eipQuery = rtcEip ? `&eip=${encodeURIComponent(rtcEip)}` : '';

  const whepUrl = `${schema}://${resolvedHost}:1985/rtc/v1/whep/?app=live&stream=${encodeURIComponent(
    streamKey
  )}${eipQuery}`;

  const startPlay = async () => {
    if (status === 'connecting' || status === 'playing') return;

    setStatus('connecting');
    setError('');

    try {
      if (client) {
        try {
          client.close();
        } catch {}
      }

      const p = new SrsSDK.SrsRtcWhipWhepAsync();

      p.ontrack = async () => {
        if (!videoRef.current) return;
        videoRef.current.srcObject = p.stream;
        videoRef.current.muted = false;

        try {
          await videoRef.current.play();
        } catch (e) {
          console.warn('[LivePlayer] autoplay blocked:', e);
        }

        // Chỉ set playing khi đã có track
        setStatus('playing');
      };

      await p.play(whepUrl, {
        videoOnly: false,
        audioOnly: false,
      });

      setClient(p);
      // status sẽ chuyển playing khi ontrack
    } catch (e) {
      console.error('[LivePlayer] play error:', e);
      setError(e?.message || String(e));
      setStatus('error');
    }
  };

  const stopPlay = () => {
    try {
      if (client) client.close();
    } catch {}
    setClient(null);

    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus('idle');
    setError('');
  };

  useEffect(() => {
    return () => stopPlay();
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
      {/* Header + nút để luôn thấy */}
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
            backgroundColor: '#22c55e',
            fontSize: 11,
            textTransform: 'uppercase',
          }}
        >
          LIVE
        </span>
        <span>Xem livestream</span>

        <button
          onClick={status === 'playing' ? stopPlay : startPlay}
          disabled={status === 'connecting'}
          style={{
            marginLeft: 10,
            padding: '6px 14px',
            borderRadius: 999,
            border: 'none',
            cursor: status === 'connecting' ? 'default' : 'pointer',
            background:
              status === 'playing'
                ? 'linear-gradient(135deg,#f97316,#ef4444)'
                : 'linear-gradient(135deg,#22c55e,#16a34a)',
            color: '#f9fafb',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {status === 'connecting'
            ? 'Đang kết nối...'
            : status === 'playing'
            ? 'Dừng xem'
            : 'Xem'}
        </button>

        <span style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.8 }}>
          {status.toUpperCase()} · Host: {resolvedHost} · Key: {streamKey}
        </span>
      </div>

      {/* Video */}
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

      {error && (
        <div style={{ padding: '10px 12px', color: '#fb923c', fontSize: 12 }}>
          Lỗi: {error}
          <div style={{ opacity: 0.85, marginTop: 4 }}>
            WHEP: {whepUrl}
          </div>
        </div>
      )}
    </div>
  );
}

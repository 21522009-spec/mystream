// frontend/src/pages/Explore.jsx
import { useEffect, useMemo, useState } from "react";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:4000";

export default function Explore({ onJoinRoom }) {
  const [streams, setStreams] = useState([]);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = (q || "").trim().toLowerCase();
    if (!s) return streams;
    return streams.filter((x) => (x.roomCode || "").toLowerCase().includes(s));
  }, [streams, q]);

  async function load() {
    try {
      const res = await fetch(`${API_BASE}/api/live-streams`);
      const j = await res.json();
      setStreams(j.streams || []);
    } catch {
      setStreams([]);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search room…"
          style={{
            padding: "8px 10px",
            borderRadius: 999,
            border: "1px solid rgba(148,163,184,0.5)",
            background: "rgba(15,23,42,0.9)",
            color: "#e5f2ff",
            outline: "none",
          }}
        />
        <button onClick={load}>Refresh</button>
      </div>

      <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
        {filtered.map((s) => (
          <div
            key={s.id}
            style={{
              padding: 12,
              borderRadius: 12,
              border: "1px solid rgba(148,163,184,0.25)",
              cursor: "pointer",
            }}
            onClick={() => onJoinRoom?.(s.roomCode)}
          >
            <b>{s.roomCode}</b> · viewers: {s.clients ?? 0}
          </div>
        ))}
        {!filtered.length && <div>Không có livestream.</div>}
      </div>
    </div>
  );
}

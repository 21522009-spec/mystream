// frontend/src/App.js
import { useEffect, useMemo, useState } from "react";
import "./App.css";

import LivePlayer from "./components/LivePlayer";
import ChatBox from "./components/ChatBox";
import StreamerStudio from "./components/StreamerStudio";

import { socket } from "./socket";

// Ưu tiên env để sau này bạn có thể đổi host dễ dàng.
// Local dev: backend chạy port 4000.
const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:4000";

export default function App() {
  // ========= AUTH =========
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [currentUser, setCurrentUser] = useState(null);

  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");

  // ========= NAV / ROOM =========
  const [tab, setTab] = useState("explore"); // explore | room | studio | profile
  const [search, setSearch] = useState("");
  const [roomInput, setRoomInput] = useState("");
  const [selectedRoom, setSelectedRoom] = useState(""); // roomCode = streamKey

  // room code của mình (được backend sinh tự động khi register)
  const myRoomCode = useMemo(
    () => currentUser?.stream_key || currentUser?.streamKey || "",
    [currentUser]
  );

  // room đang xem (nếu chưa chọn thì mặc định xem phòng của mình)
  const activeRoom = useMemo(
    () => selectedRoom || myRoomCode,
    [selectedRoom, myRoomCode]
  );

  // ========= REACTIONS =========
  const REACTION_ICONS = ["❤️", "👍", "😂", "🔥", "👏"];
  const [reactions, setReactions] = useState([]);

  // ========= EXPLORE LIST =========
  const [streams, setStreams] = useState([]);
  const filteredStreams = useMemo(() => {
    const q = (search || "").trim().toLowerCase();
    if (!q) return streams;
    return streams.filter((s) => (s.roomCode || "").toLowerCase().includes(q));
  }, [streams, search]);

  // ========= PROFILE VIDEOS =========
  const [myVideos, setMyVideos] = useState([]);

  // ========= helpers =========
  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!res.ok) {
      const msg = (data && data.error) || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  async function fetchMe(tk) {
    try {
      const res = await fetch(`${API_BASE}/api/me`, {
        headers: { Authorization: `Bearer ${tk}` },
      });
      const j = await res.json();
      if (j?.user) setCurrentUser(j.user);
    } catch {
      // ignore
    }
  }

  async function loginOrRegister(isRegister) {
    setAuthError("");
    try {
      const endpoint = isRegister ? "/api/register" : "/api/login";
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Auth failed");
      if (!j?.token) throw new Error("Thiếu token từ server");

      localStorage.setItem("token", j.token);
      setToken(j.token);
      setCurrentUser(j.user || null);
      await fetchMe(j.token);
    } catch (e) {
      setAuthError(e.message || "Auth error");
    }
  }

  function logout() {
    localStorage.removeItem("token");
    setToken(null);
    setCurrentUser(null);
    setSelectedRoom("");
    setTab("explore");
  }

  async function loadLiveStreams() {
    try {
      const j = await api("/api/live-streams");
      setStreams(j.streams || []);
    } catch {
      setStreams([]);
    }
  }

  async function loadMyVideos() {
    try {
      const j = await api("/api/videos/mine");
      setMyVideos(j.videos || []);
    } catch {
      setMyVideos([]);
    }
  }

  // ========= join/leave room theo activeRoom =========
  useEffect(() => {
    if (!activeRoom) return;

    socket.emit("join_room", activeRoom);
    return () => socket.emit("leave_room", activeRoom);
  }, [activeRoom]);

  // ========= receive reactions =========
  useEffect(() => {
    const onReaction = (r) => {
      if (!r) return;
      if (r.roomCode && activeRoom && r.roomCode !== activeRoom) return;

      const id = r.id || `${Date.now()}_${Math.random()}`;
      const rr = { ...r, id };
      setReactions((prev) => [...prev, rr]);

      setTimeout(() => {
        setReactions((prev) => prev.filter((x) => x.id !== id));
      }, 2500);
    };

    socket.on("reaction", onReaction);
    return () => socket.off("reaction", onReaction);
  }, [activeRoom]);

  // ========= load user if token =========
  useEffect(() => {
    if (!token) return;
    fetchMe(token);
  }, [token]);

  // ========= auto-refresh explore list =========
  useEffect(() => {
    if (!token) return;
    if (tab !== "explore") return;

    loadLiveStreams();
    const t = setInterval(loadLiveStreams, 3000);
    return () => clearInterval(t);
  }, [token, tab]);

  // ========= when open profile =========
  useEffect(() => {
    if (!token) return;
    if (tab !== "profile") return;
    loadMyVideos();
  }, [token, tab]);

  // ========= send reaction =========
  function sendReaction(icon) {
    if (!activeRoom) return;
    socket.emit("reaction", { roomCode: activeRoom, icon, x: Math.random() });
  }

  // ========= upload helper (StreamerStudio sẽ gọi) =========
  async function uploadRecordingBlob(blob) {
    const fd = new FormData();
    fd.append("file", blob, `record_${Date.now()}.webm`);

    const res = await fetch(`${API_BASE}/api/videos/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });

    const j = await res.json().catch(() => null);
    if (!res.ok) throw new Error(j?.error || "Upload failed");
    return j;
  }

  // ========= LOGIN UI =========
  if (!token) {
    return (
      <div className="login-shell">
        <div className="login-left">
          <div className="login-left-header">
            <div className="login-logo-text">
              <span className="login-logo-dot" />
              MyStream
            </div>
            <div className="login-badge">SRS · WebRTC · Socket.IO</div>
          </div>

          <div className="login-hero-title">MyStream</div>
          <div className="login-hero-subtitle">
            Demo livestream đa người dùng trên localhost: xem phòng, chat, reaction,
            lưu video sau khi stream.
          </div>

          <div className="login-hero-card">
            <div className="login-hero-screen">
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div className="login-hero-avatar">🎥</div>
                <div>
                  <div style={{ fontWeight: 700 }}>Live studio</div>
                  <div style={{ fontSize: 12, opacity: 0.85 }}>
                    Publish WebRTC (WHIP) & Watch (WHEP)
                  </div>
                </div>
              </div>

              <div className="login-hero-icons">
                <div className="login-hero-pill top-left">
                  <span className="icon" /> Chat realtime
                </div>
                <div className="login-hero-pill bottom-left">
                  <span className="icon" /> Reaction overlay
                </div>
                <div className="login-hero-pill bottom-right">
                  <span className="icon" /> Record & Save
                </div>
              </div>
            </div>

            <div className="login-hero-controls">
              <div className="login-hero-timeline">
                <span />
              </div>
              <span>Multi-user</span>
            </div>
          </div>

          <div className="login-dot dot-1" />
          <div className="login-dot small blue dot-2" />
          <div className="login-dot small dot-3" />

          <div className="login-left-footer">
            <span>Localhost mode</span>
            <span>v0.1</span>
          </div>
        </div>

        <div className="login-right">
          <div className="login-card">
            <div className="login-brand">
              <span>M</span><span>Y</span><span>S</span><span>T</span><span>R</span><span>E</span><span>A</span><span>M</span>
            </div>

            <div className="login-heading">
              {isRegisterMode ? "Create account" : "Sign in"}
            </div>
            <div className="login-subheading">
              {isRegisterMode
                ? "Tạo tài khoản để nhận mã phòng (stream key) tự động."
                : "Đăng nhập để vào Studio / Room / Profile."}
            </div>

            <div className="login-divider">
              <div className="login-divider-line" />
              <span>account</span>
              <div className="login-divider-line" />
            </div>

            <div className="login-form-field">
              <div className="login-label">Username</div>
              <input
                className="login-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="vd: u1"
              />
            </div>

            <div className="login-form-field">
              <div className="login-label">Password</div>
              <input
                className="login-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                onKeyDown={(e) => e.key === "Enter" && loginOrRegister(isRegisterMode)}
              />
            </div>

            <button
              className="login-submit-btn"
              onClick={() => loginOrRegister(isRegisterMode)}
            >
              {isRegisterMode ? "Register" : "Login"}
            </button>

            {authError && <div className="login-error">{authError}</div>}

            <div className="login-footer">
              <span>
                {isRegisterMode ? "Already have an account?" : "New user?"}
              </span>
              <span
                className="login-link"
                onClick={() => setIsRegisterMode((v) => !v)}
              >
                {isRegisterMode ? "Sign in" : "Register"}
              </span>
            </div>

            <div style={{ marginTop: 10, fontSize: 11, color: "#94a3b8" }}>
              API: {API_BASE}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========= APP UI =========
  const showSearch = tab === "explore";

  return (
    <div className="app">
      <div className="topbar">
        <div className="topbar-left">
          <div className="logo">MYSTREAM</div>

          <div className="top-nav">
            <div
              className={`nav-item ${tab === "explore" ? "active" : ""}`}
              onClick={() => setTab("explore")}
            >
              Explore
            </div>
            <div
              className={`nav-item ${tab === "room" ? "active" : ""}`}
              onClick={() => setTab("room")}
            >
              Room
            </div>
            <div
              className={`nav-item ${tab === "studio" ? "active" : ""}`}
              onClick={() => setTab("studio")}
            >
              Studio
            </div>
            <div
              className={`nav-item ${tab === "profile" ? "active" : ""}`}
              onClick={() => setTab("profile")}
            >
              Profile
            </div>
          </div>
        </div>

        <div className="topbar-center">
          {showSearch ? (
            <input
              className="search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm stream theo mã phòng…"
            />
          ) : (
            <div />
          )}
        </div>

        <div className="topbar-right">
          <div className="app-user-label">
            Đã đăng nhập: <b>{currentUser?.username || "?"}</b>
          </div>
          <button className="app-logout" onClick={logout}>
            Logout
          </button>
        </div>
      </div>

      <div className="main">
        <div className="sidebar-left">
          <div className="sidebar-title">Live</div>
          <div className="sidebar-avatar-list">
            <div className="avatar-circle online" title="You" />
            <div className="avatar-circle" />
            <div className="avatar-circle" />
          </div>
        </div>

        <div className="content">
          {/* ====== EXPLORE TAB ====== */}
          {tab === "explore" && (
            <>
              <div className="stream-strip">
                <div className="strip-left">
                  <div className="strip-avatar" />
                  <div className="strip-text">
                    <div className="strip-title">Explore livestreams</div>
                    <div className="strip-subtitle">
                      Nhập mã phòng để vào Room hoặc bấm stream đang live.
                    </div>
                  </div>
                </div>

                <div className="strip-right">
                  <input
                    className="search-input"
                    style={{ maxWidth: 220 }}
                    value={roomInput}
                    onChange={(e) => setRoomInput(e.target.value)}
                    placeholder="Mã phòng (stream key)"
                  />
                  <button
                    className="pill-btn primary"
                    onClick={() => {
                      const code = (roomInput || "").trim();
                      if (!code) return;
                      setSelectedRoom(code);
                      setTab("room");
                    }}
                  >
                    Vào phòng
                  </button>
                  <button className="pill-btn" onClick={loadLiveStreams}>
                    Refresh
                  </button>
                </div>
              </div>

              <div className="stream-grid">
                {filteredStreams.map((s) => (
                  <div
                    key={s.id}
                    className="stream-card"
                    onClick={() => {
                      setSelectedRoom(s.roomCode);
                      setTab("room");
                    }}
                  >
                    <div className="thumb-placeholder">LIVE</div>
                    <div className="stream-card-body">
                      <div className="stream-title">{s.roomCode}</div>
                      <div className="stream-meta">
                        <span>Viewers: {s.clients ?? 0}</span>
                        <span>·</span>
                        <span>App: {s.app}</span>
                      </div>
                    </div>
                  </div>
                ))}

                {!filteredStreams.length && (
                  <div className="panel" style={{ gridColumn: "1 / -1" }}>
                    <h2>Chưa thấy livestream nào</h2>
                    <p>
                      Nếu bạn vừa bấm “Bắt đầu” ở Studio mà Explore chưa thấy, hãy kiểm tra
                      SRS đang chạy và streamKey không rỗng.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ====== ROOM TAB (xem livestream) ====== */}
          {tab === "room" && (
            <>
              <div className="stream-strip">
                <div className="strip-left">
                  <div className="strip-avatar" />
                  <div className="strip-text">
                    <div className="strip-title">
                      Room: <span style={{ color: "#00aaff" }}>{activeRoom || "—"}</span>
                    </div>
                    <div className="strip-subtitle">
                      Bạn có thể mở thêm 1 trình duyệt (ẩn danh) để đăng nhập tài khoản khác và xem cùng lúc.
                    </div>
                  </div>
                </div>

                <div className="strip-right">
                  <button
                    className="pill-btn"
                    onClick={() => {
                      setSelectedRoom("");
                    }}
                    title="Quay về phòng của bạn"
                  >
                    Về phòng của tôi
                  </button>
                </div>
              </div>

              <div className="player-wrapper">
                <div className="player" style={{ height: "100%" }}>
                  <span className="live-badge">LIVE</span>
                  <span className="viewer-counter">Room</span>

                  <LivePlayer streamKey={activeRoom} />

                  {/* Reactions overlay */}
                  <div className="reactionsLayer">
                    {reactions.map((r) => (
                      <span
                        key={r.id}
                        className="reactionFloat"
                        style={{ left: `${(r.x || 0.5) * 100}%` }}
                      >
                        {r.icon}
                      </span>
                    ))}
                  </div>

                  <div className="reactionBar">
                    {REACTION_ICONS.map((ic) => (
                      <button key={ic} onClick={() => sendReaction(ic)}>
                        {ic}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ====== STUDIO TAB (phát livestream) ====== */}
          {tab === "studio" && (
            <>
              <div className="stream-strip">
                <div className="strip-left">
                  <div className="strip-avatar" />
                  <div className="strip-text">
                    <div className="strip-title">Studio livestream</div>
                    <div className="strip-subtitle">
                      Mã phòng của bạn:{" "}
                      <b style={{ color: "#00aaff" }}>{myRoomCode || "—"}</b>
                    </div>
                  </div>
                </div>

                <div className="strip-right">
                  <button
                    className="pill-btn"
                    onClick={() => {
                      if (!myRoomCode) return;
                      navigator.clipboard?.writeText(myRoomCode);
                    }}
                  >
                    Copy mã phòng
                  </button>
                </div>
              </div>

              <div className="player-wrapper">
                <StreamerStudio
                  streamKey={myRoomCode}
                  onRecordingReady={uploadRecordingBlob}
                />
              </div>
            </>
          )}

          {/* ====== PROFILE TAB ====== */}
          {tab === "profile" && (
            <>
              <div className="stream-strip">
                <div className="strip-left">
                  <div className="strip-avatar" />
                  <div className="strip-text">
                    <div className="strip-title">Profile</div>
                    <div className="strip-subtitle">
                      Username: <b style={{ color: "#00aaff" }}>{currentUser?.username}</b>{" "}
                      · Room code: <b style={{ color: "#00aaff" }}>{myRoomCode}</b>
                    </div>
                  </div>
                </div>

                <div className="strip-right">
                  <button className="pill-btn" onClick={loadMyVideos}>
                    Tải lại video
                  </button>
                </div>
              </div>

              <div className="panel" style={{ marginTop: 12 }}>
                <h2>Video đã lưu</h2>
                <p>
                  Video được lưu sau khi bạn “Dừng livestream” (record local rồi upload lên backend).
                </p>

                <div className="stream-grid" style={{ marginTop: 10 }}>
                  {myVideos.map((v) => (
                    <div key={v.filename} className="stream-card">
                      <div className="thumb-placeholder">REC</div>
                      <div className="stream-card-body">
                        <div className="stream-title">{v.filename}</div>
                        <div className="stream-meta" style={{ marginTop: 8 }}>
                          <video
                            src={`${API_BASE}${v.url}`}
                            controls
                            style={{ width: "100%", borderRadius: 12, background: "#000" }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                  {!myVideos.length && (
                    <div className="panel" style={{ gridColumn: "1 / -1" }}>
                      <h2>Chưa có video</h2>
                      <p>Hãy vào Studio, bấm Bắt đầu rồi Dừng để tạo video.</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="chat">
          <div className="chat-header">
            <div className="chat-title">Chat</div>
            <div className="chat-username">Room: {activeRoom || "—"}</div>
          </div>

          <ChatBox roomCode={activeRoom} currentUser={currentUser} />
        </div>
      </div>
    </div>
  );
}

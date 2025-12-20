import { useEffect, useRef, useState } from "react";
import { socket } from "../socket";

export default function ChatBox({ roomCode, username, currentUser }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const listRef = useRef(null);

  const displayName = username || currentUser?.username || "guest";

  useEffect(() => {
    setMessages([]);
  }, [roomCode]);

  useEffect(() => {
    const onMsg = (m) => {
      if (!m) return;
      if (m.roomCode !== roomCode) return;
      setMessages((prev) => [...prev, m]);
    };

    socket.on("chat_message", onMsg);
    return () => socket.off("chat_message", onMsg);
  }, [roomCode]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  function send(icon = "💬") {
    const t = (text || "").trim();
    if (!t) return;
    if (!roomCode) return;

    socket.emit("chat_message", {
      roomCode,
      user: displayName,
      text: t,
      icon,
    });

    setText("");
  }

  return (
    <div className="chatbox">
      <div className="chatbox-list" ref={listRef}>
        {messages.map((m, idx) => (
          <div key={m.ts ? `${m.ts}_${idx}` : idx} className="chatbox-item">
            <div className="meta">
              <b>{m.user || "anon"}</b> · {m.icon || "💬"}
            </div>
            <div className="text">{m.text}</div>
          </div>
        ))}
      </div>

      <div className="chatbox-actions">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={roomCode ? `Nhập nội dung... (Room ${roomCode})` : "Nhập nội dung..."}
          onKeyDown={(e) => e.key === "Enter" && send("💬")}
        />
        <button onClick={() => send("💬")}>Gửi</button>
      </div>
    </div>
  );
}

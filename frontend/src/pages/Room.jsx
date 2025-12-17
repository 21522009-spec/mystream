// frontend/src/pages/Room.jsx
import LivePlayer from "../components/LivePlayer";
import ChatBox from "../components/ChatBox";

export default function Room({ roomCode, currentUser }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 12 }}>
      <div style={{ borderRadius: 12, overflow: "hidden", background: "#000" }}>
        <LivePlayer streamKey={roomCode} />
      </div>
      <div style={{ borderRadius: 12, overflow: "hidden" }}>
        <ChatBox roomCode={roomCode} currentUser={currentUser} />
      </div>
    </div>
  );
}

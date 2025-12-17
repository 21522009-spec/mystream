import { useEffect, useState } from 'react';
import { socket } from '../socket';

const ICONS = ['❤️', '👍', '😂', '🔥', '👏'];

export default function VideoStage({ roomCode, children }) {
  const [reactions, setReactions] = useState([]);

  useEffect(() => {
    const onReaction = (r) => {
      if (!r) return;
      setReactions((prev) => [...prev, r]);
      setTimeout(() => {
        setReactions((prev) => prev.filter((x) => x.id !== r.id));
      }, 2500);
    };

    socket.on('reaction', onReaction);
    return () => socket.off('reaction', onReaction);
  }, []);

  function sendReaction(icon) {
    if (!roomCode) return;
    socket.emit('reaction', { roomCode, icon, x: Math.random() });
  }

  return (
    <div className="videoStage">
      {children}

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
        {ICONS.map((ic) => (
          <button key={ic} onClick={() => sendReaction(ic)}>{ic}</button>
        ))}
      </div>
    </div>
  );
}

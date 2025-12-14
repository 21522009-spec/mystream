import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

// kết nối tới backend (port 4000)
const socket = io('http://localhost:4000');

export default function ChatBox({ username }) {
  const [text, setText] = useState('');
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    socket.on('chat_message', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    return () => {
      socket.off('chat_message');
    };
  }, []);

  const send = () => {
    if (!text.trim()) return;
    socket.emit('chat_message', {
      user: username || 'Guest',
      text,
      icon: '👍',
    });
    setText('');
  };

  return (
    <div style={{ border: '1px solid #ccc', padding: 8, maxWidth: 400 }}>
      <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 8 }}>
        {messages.map((m, i) => (
          <div key={i}>
            <b>{m.user}</b>: {m.icon} {m.text}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <input
          style={{ flex: 1 }}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Nhập bình luận..."
          onKeyDown={e => e.key === 'Enter' && send()}
        />
        <button onClick={send}>Gửi</button>
      </div>
    </div>
  );
}

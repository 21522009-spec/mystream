// frontend/src/socket.js
import { io } from "socket.io-client";

// Ưu tiên: REACT_APP_SOCKET_URL, nếu không có thì dùng API base.
const SOCKET_URL =
  process.env.REACT_APP_SOCKET_URL ||
  process.env.REACT_APP_BACKEND_URL ||
  process.env.REACT_APP_API_BASE ||
  "http://localhost:4000";

export const socket = io(SOCKET_URL, {
  autoConnect: true,
  transports: ["websocket"], // ổn định hơn khi dev
});

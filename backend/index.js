// backend/index.js
const crypto = require('crypto');
const express = require('express');
const http = require('http');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const db = require('./db');

const JWT_SECRET = 'CHANGE_THIS_SECRET';

const app = express();
app.use(cors());
app.use(express.json());

// Tạo HTTP server & gắn Socket.IO lên
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3000', // cho phép frontend dev
    methods: ['GET', 'POST'],
  },
});

// ===== HELPER LÀM VIỆC VỚI DB =====

function generateStreamKey() {
  // Tạo key ngẫu nhiên, ví dụ: 'f3a9c7d01b2e4f56'
  return crypto.randomBytes(8).toString('hex');
}

async function findUserByUsername(username) {
  const result = await db.query(
    'SELECT * FROM users WHERE username = $1',
    [username]
  );
  return result.rows[0];
}

async function createUser({ username, password, role }) {
  const hash = await bcrypt.hash(password, 10);
  const streamKey = generateStreamKey();

  const result = await db.query(
    `INSERT INTO users (username, password_hash, role, stream_key)
     VALUES ($1, $2, $3, $4)
     RETURNING id, username, role, stream_key, created_at`,
    [username, hash, role || 'viewer', streamKey]
  );
  return result.rows[0];
}

// ===== ROUTE TEST ĐƠN GIẢN =====

app.get('/', (req, res) => {
  res.send('API is running');
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ===== API AUTH (ĐĂNG KÝ, ĐĂNG NHẬP) =====

// POST /api/register
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Thiếu username hoặc password' });
    }

    const exist = await findUserByUsername(username);
    if (exist) {
      return res.status(400).json({ error: 'Username đã tồn tại' });
    }

    const user = await createUser({ username, password, role });
    // Trả user (gồm cả stream_key); frontend hiện đang login lại ngay sau register
    res.json({ user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await findUserByUsername(username);

    if (!user) {
      return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu' });
    }

    // Đưa luôn stream_key vào payload JWT
    const payload = {
      id: user.id,
      username: user.username,
      role: user.role,
      stream_key: user.stream_key,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '2h' });

    // Trả cả token và thông tin user
    res.json({
      token,
      user: payload,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== Middleware kiểm tra JWT =====

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// GET /api/me – xem lại thông tin user từ token
app.get('/api/me', authMiddleware, (req, res) => {
  // req.user bây giờ có: id, username, role, stream_key
  res.json({ user: req.user });
});

// ===== SOCKET.IO CHAT =====

io.on('connection', (socket) => {
  console.log('Client connected', socket.id);

  // Nhận tin nhắn chat từ client
  socket.on('chat_message', (msg) => {
    // msg: { user, text, icon }
    // Broadcast lại cho tất cả client khác
    io.emit('chat_message', msg);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected', socket.id);
  });
});

// ===== START SERVER =====

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log('Backend listening on port', PORT);
});

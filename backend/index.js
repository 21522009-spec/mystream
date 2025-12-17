// backend/index.js
const crypto = require("crypto");
const express = require("express");
const http = require("http");
const https = require("https");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const db = require("./db");

// Upload video + HLS convert
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { exec } = require("child_process");

// ===== Config =====
const PORT = process.env.PORT || 4000;
// IMPORTANT: listen ra LAN
const HOST = process.env.HOST || "0.0.0.0";

const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_THIS_SECRET";

// SRS HTTP API (để explore stream WebRTC nếu bạn vẫn dùng SRS)
const SRS_HTTP = process.env.SRS_HTTP_API || "http://localhost:1985";

// Root project (mystream/)
const PROJECT_ROOT = path.resolve(__dirname, "..");

// Nơi lưu file video upload (để tải lại trực tiếp nếu muốn)
const UPLOAD_DIR = path.join(__dirname, "uploads");
const TMP_DIR = path.join(UPLOAD_DIR, "tmp");
const VIDEO_DIR = path.join(UPLOAD_DIR, "videos");

// Nơi xuất HLS VOD (phải trùng với volume ./hls-vod:/tmp/hls trong nginx container)
const VOD_HLS_DIR = process.env.VOD_HLS_DIR || path.join(PROJECT_ROOT, "hls-vod");

// Nếu muốn ép public host cho link trả về (ví dụ deploy), set PUBLIC_HOST/PUBLIC_SCHEMA
const PUBLIC_HOST = (process.env.PUBLIC_HOST || "").trim(); // ví dụ: 192.168.110.37
const PUBLIC_SCHEMA = (process.env.PUBLIC_SCHEMA || "").trim(); // http/https
const VOD_PORT = process.env.VOD_PORT || 8080;

fs.mkdirSync(TMP_DIR, { recursive: true });
fs.mkdirSync(VIDEO_DIR, { recursive: true });
fs.mkdirSync(VOD_HLS_DIR, { recursive: true });

function getJson(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;

    const req = lib.get(url, (res) => {
      let raw = "";
      res.setEncoding("utf8");

      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        const body = (raw || "").replace(/^\uFEFF/, "").trim(); // bỏ BOM + trim

        if (res.statusCode && res.statusCode >= 400) {
          return reject(
            new Error(
              `HTTP ${res.statusCode} from ${url}. Body: ${body.slice(0, 300)}`
            )
          );
        }

        if (!body) return resolve({});

        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(
            new Error(
              `Invalid JSON from ${url}. First 300 chars: ${body.slice(0, 300)}`
            )
          );
        }
      });
    });

    req.on("error", reject);
  });
}

// ===== Helpers: CORS + public URLs =====
const LAN_IP = "192.168.110.37"; // IP LAN chuẩn của bạn (route default)

const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",

  // LAN (dùng khi bạn mở web bằng IP)
  `http://${LAN_IP}:3000`,
  `http://${LAN_IP}:5173`,
]);

function corsOriginChecker(origin, cb) {
  // Cho phép request không có Origin (curl/postman)
  if (!origin) return cb(null, true);
  return cb(null, ALLOWED_ORIGINS.has(origin));
}

function getVodBaseUrl(req) {
  const host = PUBLIC_HOST || req.hostname || LAN_IP;
  const schema = PUBLIC_SCHEMA || req.protocol || "http";
  return `${schema}://${host}:${VOD_PORT}`;
}

const app = express();

app.use(
  cors({
    origin: corsOriginChecker,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
  })
);

app.use(express.json());

// Static để bạn vẫn có thể tải file upload trực tiếp từ backend (tuỳ bạn dùng)
app.use("/uploads", express.static(UPLOAD_DIR));

const upload = multer({ dest: TMP_DIR });

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: corsOriginChecker,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
  },
});

// ===== DB init =====
async function initDb() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      stream_key TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);`
  );
}

function generateStreamKey() {
  return crypto.randomBytes(8).toString("hex");
}

async function findUserByUsername(username) {
  const result = await db.query("SELECT * FROM users WHERE username = $1", [
    username,
  ]);
  return result.rows[0];
}

async function createUser({ username, password, role }) {
  const hash = await bcrypt.hash(password, 10);

  let streamKey = generateStreamKey();
  for (let i = 0; i < 5; i++) {
    const exist = await db.query("SELECT 1 FROM users WHERE stream_key = $1", [
      streamKey,
    ]);
    if (!exist.rowCount) break;
    streamKey = generateStreamKey();
  }

  const result = await db.query(
    `INSERT INTO users (username, password_hash, role, stream_key)
     VALUES ($1, $2, $3, $4)
     RETURNING id, username, role, stream_key, created_at`,
    [username, hash, role || "viewer", streamKey]
  );
  return result.rows[0];
}

// ===== Basic =====
app.get("/", (req, res) => res.send("API is running"));
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

// ===== Explore live streams từ SRS (nếu bạn vẫn dùng SRS) =====
app.get("/api/live-streams", async (req, res) => {
  try {
    const j = await getJson(`${SRS_HTTP}/api/v1/streams?count=100`);

    const streams = (j.streams || [])
      .filter((s) => s.publish && s.publish.active)
      .map((s) => {
        const roomCode = (s.url || "").split("/").pop() || s.name;
        return {
          id: s.id,
          roomCode,
          name: s.name,
          app: s.app,
          url: s.url,
          clients: s.clients,
          live_ms: s.live_ms,
        };
      });

    res.json({ streams });
  } catch (e) {
    console.error("[/api/live-streams]", e);
    res.status(500).json({ error: "Cannot fetch live streams from SRS" });
  }
});

// ===== AUTH =====
app.post("/api/register", async (req, res) => {
  try {
    const { username, password, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Thiếu username hoặc password" });
    }

    const exist = await findUserByUsername(username);
    if (exist) return res.status(400).json({ error: "Username đã tồn tại" });

    const user = await createUser({ username, password, role });

    const payload = {
      id: user.id,
      username: user.username,
      role: user.role,
      stream_key: user.stream_key,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "2h" });
    res.json({ token, user: payload });
  } catch (e) {
    console.error("[/api/register]", e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await findUserByUsername(username);

    if (!user)
      return res.status(401).json({ error: "Sai tài khoản hoặc mật khẩu" });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok)
      return res.status(401).json({ error: "Sai tài khoản hoặc mật khẩu" });

    const payload = {
      id: user.id,
      username: user.username,
      role: user.role,
      stream_key: user.stream_key,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "2h" });
    res.json({ token, user: payload });
  } catch (e) {
    console.error("[/api/login]", e);
    res.status(500).json({ error: "Server error" });
  }
});

// ===== Auth middleware =====
function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "No token" });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

app.get("/api/me", authMiddleware, (req, res) => res.json({ user: req.user }));

// ===== Video upload + list =====
// POST /api/videos/upload (multipart/form-data, field name: "file")
app.post(
  "/api/videos/upload",
  authMiddleware,
  upload.single("file"),
  (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "Missing file" });

      const userId = req.user.id;

      const ext = (path.extname(req.file.originalname || "") || ".webm").toLowerCase();
      const safeExt = [".webm", ".mp4"].includes(ext) ? ext : ".webm";

      const filename = `${userId}_${Date.now()}${safeExt}`;
      const target = path.join(VIDEO_DIR, filename);

      fs.renameSync(req.file.path, target);

      // Convert sang HLS VOD để nginx serve ở /vod/<base>/index.m3u8
      const baseName = path.parse(filename).name;
      const outDir = path.join(VOD_HLS_DIR, baseName);
      fs.mkdirSync(outDir, { recursive: true });

      const outPlaylist = path.join(outDir, "index.m3u8");

      const hlsCmd = [
        "ffmpeg",
        "-y",
        "-i",
        `"${target}"`,
        "-profile:v",
        "baseline",
        "-level",
        "3.0",
        "-start_number",
        "0",
        "-hls_time",
        "4",
        "-hls_list_size",
        "0",
        "-f",
        "hls",
        `"${outPlaylist}"`,
      ].join(" ");

      exec(hlsCmd, (error) => {
        if (error) {
          console.error("[ffmpeg] HLS conversion error:", error.message);
        } else {
          console.log("[ffmpeg] HLS conversion completed for", filename);
        }
      });

      const vodBase = getVodBaseUrl(req);

      res.json({
        ok: true,
        filename,
        url: `/uploads/videos/${filename}`,
        vod_hls: `${vodBase}/vod/${baseName}/index.m3u8`,
      });
    } catch (e) {
      console.error("[/api/videos/upload]", e);
      res.status(500).json({ error: "Upload failed" });
    }
  }
);

// GET /api/videos/mine
app.get("/api/videos/mine", authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const files = fs.readdirSync(VIDEO_DIR);

    const vodBase = getVodBaseUrl(req);

    const videos = files
      .filter((f) => f.startsWith(`${userId}_`))
      .sort()
      .reverse()
      .map((f) => {
        const base = path.parse(f).name;
        return {
          filename: f,
          url: `/uploads/videos/${f}`,
          vod_hls: `${vodBase}/vod/${base}/index.m3u8`,
        };
      });

    res.json({ videos });
  } catch (e) {
    console.error("[/api/videos/mine]", e);
    res.status(500).json({ error: "Cannot list videos" });
  }
});

// ===== Socket.IO: chat + reactions theo phòng =====
io.on("connection", (socket) => {
  console.log("Client connected", socket.id);

  socket.on("join_room", (roomCode) => {
    if (!roomCode) return;
    socket.join(roomCode);
  });

  socket.on("leave_room", (roomCode) => {
    if (!roomCode) return;
    socket.leave(roomCode);
  });

  socket.on("chat_message", (msg) => {
    const roomCode = msg?.roomCode;
    if (!roomCode) return;

    io.to(roomCode).emit("chat_message", {
      roomCode,
      user: msg.user,
      text: msg.text,
      icon: msg.icon || "💬",
      ts: Date.now(),
    });
  });

  socket.on("reaction", (payload) => {
    const roomCode = payload?.roomCode;
    if (!roomCode) return;

    io.to(roomCode).emit("reaction", {
      roomCode,
      icon: payload.icon || "❤️",
      x: typeof payload.x === "number" ? payload.x : Math.random(),
      id: `${Date.now()}_${Math.random()}`,
      ts: Date.now(),
    });
  });

  socket.on("disconnect", () => console.log("Client disconnected", socket.id));
});

// ===== Start =====
initDb()
  .then(() => {
    server.listen(PORT, HOST, () => {
      console.log(`Backend listening on http://${HOST}:${PORT}`);
      console.log(
        `Allowed origins: ${Array.from(ALLOWED_ORIGINS).join(", ")}`
      );
    });
  })
  .catch((e) => {
    console.error("[initDb] Failed:", e);
    process.exit(1);
  });

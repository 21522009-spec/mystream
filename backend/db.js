// backend/db.js
const { Pool } = require("pg");

// Lưu ý:
// - Khi chạy local: DB_HOST=localhost (do compose map 5432:5432)
// - Khi chạy trong Docker network: DB_HOST=mystream-db (tên service/container)
// Ở bài của bạn hiện tại backend chạy ngoài docker => giữ localhost là đúng.
const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || "mystream",
  password: process.env.DB_PASSWORD || "mystream",
  database: process.env.DB_NAME || "mystream",
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};

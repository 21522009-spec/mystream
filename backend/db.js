// backend/db.js
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',   // dùng localhost vì DB đang map port 5432 ra ngoài
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'mystream',
  password: process.env.DB_PASSWORD || 'mystream',   // <── ĐỔI LẠI THÀNH 'mystream'
  database: process.env.DB_NAME || 'mystream',
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};

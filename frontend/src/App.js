import { useState, useEffect } from 'react';
import './App.css';
import LivePlayer from './components/LivePlayer';
import ChatBox from './components/ChatBox';
import StreamerStudio from './components/StreamerStudio';

const API_BASE = 'http://localhost:4000';
const SRS_HOST = window.location.hostname || 'localhost';
const DEFAULT_STREAM_KEY = 'u1';

function App() {
  const [token, setToken] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [activeView, setActiveView] = useState('studio');

  const [isRegisterMode, setIsRegisterMode] = useState(false);

  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [regError, setRegError] = useState('');

  const [liveList, setLiveList] = useState([]);
  const [loadingLiveList, setLoadingLiveList] = useState(false);
  const [liveListError, setLiveListError] = useState('');

  const chatUsername = currentUser?.username || 'guest';
  const streamKey = currentUser?.stream_key || DEFAULT_STREAM_KEY;

  // Auto lấy token khi reload trang
  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    if (!savedToken) return;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/me`, {
          headers: { Authorization: `Bearer ${savedToken}` },
        });
        if (!res.ok) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          return;
        }
        const data = await res.json();
        setToken(savedToken);
        setCurrentUser(data.user);
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  // Khi vào tab Explore thì load danh sách livestream
  useEffect(() => {
    if (activeView !== 'explore') return;

    setLoadingLiveList(true);
    setLiveListError('');
    fetch(`${API_BASE}/api/live-streams`)
      .then((res) => res.json())
      .then((data) => {
        setLiveList(data.items || []);
      })
      .catch((err) => {
        console.error(err);
        setLiveListError('Không tải được danh sách stream.');
      })
      .finally(() => {
        setLoadingLiveList(false);
      });
  }, [activeView]);

  async function loginWith(username, password) {
    const res = await fetch(`${API_BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Đăng nhập thất bại');
    }

    const data = await res.json();
    setToken(data.token);
    setCurrentUser(data.user);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
  }

  async function handleLogin(e) {
    e.preventDefault();
    setLoginError('');

    try {
      await loginWith(loginUsername, loginPassword);
    } catch (err) {
      console.error(err);
      setLoginError(err.message);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setRegError('');

    if (!regUsername.trim() || !regPassword.trim()) {
      setRegError('Vui lòng nhập đầy đủ username và password.');
      return;
    }
    if (regPassword.length < 6) {
      setRegError('Mật khẩu phải từ 6 ký tự trở lên.');
      return;
    }
    if (regPassword !== regConfirm) {
      setRegError('Mật khẩu xác nhận không khớp.');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: regUsername,
          password: regPassword,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Đăng ký thất bại');
      }

      await loginWith(regUsername, regPassword);

      setIsRegisterMode(false);
      setRegUsername('');
      setRegPassword('');
      setRegConfirm('');
      setRegError('');
    } catch (err) {
      console.error(err);
      setRegError(err.message);
    }
  }

  function handleLogout() {
    setToken(null);
    setCurrentUser(null);
    setLoginUsername('');
    setLoginPassword('');
    setLoginError('');
    setRegError('');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setActiveView('studio');
  }

  /* ============ MÀN HÌNH LOGIN / REGISTER ============ */
  if (!token) {
    return (
      <div className="login-shell">
        <div className="login-left">
          <div className="login-left-header">
            <div className="login-logo-text">
              <span className="login-logo-dot" />
              <span>MYSTREAM</span>
            </div>
            <div className="login-badge">Live & VOD Studio</div>
          </div>

          <h1 className="login-hero-title">
            Tạo buổi livestream của riêng bạn.
          </h1>
          <p className="login-hero-subtitle">
            Lên lịch, phát trực tiếp và tương tác với khán giả bằng chat, icon
            và các công cụ realtime.
          </p>

          <div className="login-hero-card">
            <div className="login-hero-screen">
              <div className="login-hero-avatar">🎸</div>
            </div>
          </div>
        </div>

        <div className="login-right">
          <div className="login-card">
            <div className="login-brand">
              <span>MY</span>
              <span>STREAM</span>
            </div>

            {!isRegisterMode ? (
              <>
                <h2 className="login-heading">Log in to your account</h2>
                <p className="login-subheading">
                  Sử dụng tài khoản đã được tạo sẵn để truy cập dashboard
                  livestream.
                </p>

                <form onSubmit={handleLogin}>
                  <div className="login-form-field">
                    <div className="login-label">Username</div>
                    <input
                      className="login-input"
                      value={loginUsername}
                      onChange={(e) => setLoginUsername(e.target.value)}
                      placeholder="vd: streamer1"
                    />
                  </div>

                  <div className="login-form-field">
                    <div className="login-label">Password</div>
                    <input
                      type="password"
                      className="login-input"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                  </div>

                  <button type="submit" className="login-submit-btn">
                    Login
                  </button>

                  {loginError && (
                    <div className="login-error">{loginError}</div>
                  )}
                </form>

                <div className="login-footer">
                  <span>Not registered yet?</span>
                  <span
                    className="login-link"
                    onClick={() => {
                      setIsRegisterMode(true);
                      setLoginError('');
                    }}
                  >
                    Create an account
                  </span>
                </div>
              </>
            ) : (
              <>
                <h2 className="login-heading">Create your account</h2>
                <p className="login-subheading">
                  Đăng ký tài khoản mới để bắt đầu tham gia hoặc tạo livestream.
                </p>

                <form onSubmit={handleRegister}>
                  <div className="login-form-field">
                    <div className="login-label">Username</div>
                    <input
                      className="login-input"
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value)}
                      placeholder="Chọn một username"
                    />
                  </div>

                  <div className="login-form-field">
                    <div className="login-label">Password</div>
                    <input
                      type="password"
                      className="login-input"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                  </div>

                  <div className="login-form-field">
                    <div className="login-label">Confirm password</div>
                    <input
                      type="password"
                      className="login-input"
                      value={regConfirm}
                      onChange={(e) => setRegConfirm(e.target.value)}
                      placeholder="Nhập lại mật khẩu"
                    />
                  </div>

                  <button type="submit" className="login-submit-btn">
                    Create account
                  </button>

                  {regError && <div className="login-error">{regError}</div>}
                </form>

                <div className="login-footer">
                  <span>Already have an account?</span>
                  <span
                    className="login-link"
                    onClick={() => {
                      setIsRegisterMode(false);
                      setRegError('');
                    }}
                  >
                    Back to login
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ============ VIEW SAU KHI ĐĂNG NHẬP ============ */

  function renderStudioView() {
    return (
      <div className="main">
        <section className="content">
          <div className="player-wrapper">
            <div className="player">
              <StreamerStudio srsHost={SRS_HOST} streamKey={streamKey} />
            </div>
          </div>
        </section>

        <aside className="chat">
          <ChatBox username={chatUsername} />
        </aside>
      </div>
    );
  }

  function renderLiveView() {
    return (
      <div className="main">
        <section className="content">
          <div className="player-wrapper">
            <div className="player">
              <LivePlayer srsHost={SRS_HOST} streamKey={streamKey} />
            </div>
          </div>
        </section>

        <aside className="chat">
          <ChatBox username={chatUsername} />
        </aside>
      </div>
    );
  }

  let mainView;
  if (activeView === 'studio') mainView = renderStudioView();
  else mainView = renderLiveView();

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <div className="logo">MyStream</div>
          <nav className="top-nav">
            <a
              href="#studio"
              className={`nav-item ${
                activeView === 'studio' ? 'active' : ''
              }`}
              onClick={(e) => {
                e.preventDefault();
                setActiveView('studio');
              }}
            >
              Studio
            </a>
            <a
              href="#live"
              className={`nav-item ${activeView === 'live' ? 'active' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                setActiveView('live');
              }}
            >
              Live
            </a>
          </nav>
        </div>

        <div className="topbar-right">
          <span className="app-user-label">
            Đã đăng nhập: <b>{currentUser?.username}</b> ({currentUser?.role})
          </span>
          <button className="app-logout" onClick={handleLogout}>
            Đăng xuất
          </button>
        </div>
      </header>

      {mainView}
    </div>
  );
}

export default App;

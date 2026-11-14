"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError(data.error || "Invalid password");
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      {/* Animated Background Blobs */}
      <div className="blob blob-1"></div>
      <div className="blob blob-2"></div>
      <div className="blob blob-3"></div>

      {/* Login Card */}
      <div className="login-card">
        <div className="login-header">
          <img src="/logo.png" alt="Cadence" className="login-logo" />
          <h1 className="login-title">Welcome to Cadence</h1>
          <p className="login-subtitle">Enter your password to access your CRM.</p>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          <div>
            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="login-input"
              required
            />
          </div>
          
          {error && <div className="login-error">{error}</div>}

          <button type="submit" disabled={isLoading} className="login-btn">
            {isLoading ? (
              <span className="btn-content">
                <svg className="spinner" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                VERIFYING...
              </span>
            ) : "ACCESS DASHBOARD"}
          </button>
        </form>
      </div>

      <style>{`
        .login-container {
          display: flex;
          min-height: 100vh;
          width: 100vw;
          align-items: center;
          justify-content: center;
          background: #F8F9FB;
          position: relative;
          overflow: hidden;
        }

        /* --- ANIMATED BLOBS --- */
        .blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          z-index: 1;
          opacity: 0.8;
        }
        .blob-1 {
          width: 400px;
          height: 400px;
          background: rgba(132, 204, 22, 0.2);
          top: -100px;
          left: -100px;
          animation: float 8s infinite ease-in-out;
        }
        .blob-2 {
          width: 300px;
          height: 300px;
          background: rgba(59, 130, 246, 0.15);
          bottom: -50px;
          right: -50px;
          animation: float 10s infinite ease-in-out reverse;
        }
        .blob-3 {
          width: 250px;
          height: 250px;
          background: rgba(168, 85, 247, 0.15);
          top: 40%;
          left: 20%;
          animation: float 12s infinite ease-in-out 2s;
        }

        /* --- LOGIN CARD --- */
        .login-card {
          width: 100%;
          max-width: 420px;
          padding: 48px 40px;
          background: #FFFFFF;
          border-radius: 24px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.03);
          position: relative;
          z-index: 10;
          animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .login-header {
          text-align: center;
          margin-bottom: 32px;
        }
        .login-logo {
          width: 56px;
          height: 56px;
          object-fit: contain;
          margin: 0 auto 20px;
          filter: drop-shadow(0px 4px 6px rgba(0,0,0,0.1));
        }
        .login-title {
          font-size: 26px;
          font-weight: 700;
          color: #111;
          letter-spacing: -0.03em;
          margin-bottom: 8px;
        }
        .login-subtitle {
          font-size: 14px;
          color: #6B7280;
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        /* --- INPUT FIELD --- */
        .login-input {
          width: 100%;
          padding: 16px;
          border-radius: 12px;
          border: 1px solid #E5E7EB;
          background: #F9FAFB;
          color: #111;
          font-size: 14px;
          outline: none;
          transition: all 0.2s ease;
          box-sizing: border-box;
        }
        .login-input::placeholder {
          color: #9CA3AF;
        }
        .login-input:focus {
          border-color: #84CC16;
          background: #FFFFFF;
          box-shadow: 0 0 0 4px rgba(132, 204, 22, 0.15);
        }

        /* --- BUTTON --- */
        .login-btn {
          width: 100%;
          padding: 16px;
          border-radius: 12px;
          background: #84CC16;
          color: #000000;
          font-size: 14px;
          font-weight: 700;
          border: none;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          letter-spacing: 0.02em;
        }
        .login-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 20px -5px rgba(132, 204, 22, 0.4);
          filter: brightness(1.05);
        }
        .login-btn:active:not(:disabled) {
          transform: translateY(0);
          box-shadow: none;
        }
        .login-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
          background: #9CA3AF;
        }
        
        .btn-content {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .login-error {
          color: #EF4444;
          font-size: 13px;
          text-align: center;
          font-weight: 500;
          background: #FEF2F2;
          padding: 12px;
          border-radius: 8px;
          border: 1px solid #FECACA;
          animation: shake 0.4s ease;
        }

        /* --- KEYFRAMES --- */
        .spinner {
          animation: spin 1s linear infinite;
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes float {
          0% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0, 0) scale(1); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
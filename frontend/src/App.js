import React, { useState } from "react";
import "./App.css";

export default function App() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", program: "Weight Loss" });
  const [msg, setMsg] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setMsg("Sending...");
    try {
      const res = await fetch('https://carelon-demo.onrender.com/api/signup', {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (data.success) setMsg("🎉 Success! Check your messages.");
      else setMsg(`⚠️ Failed: ${data.error}`);
    } catch (err) {
      setMsg(`⚠️ Failed: ${err.toString()}`);
    }
  };

  return (
    <div className="carelon-bg">
      <nav className="carelon-navbar">
 <img
  src="data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB3aWR0aD0iMTI3cHgiIGhlaWdodD0iMzNweCIgdmlld0JveD0iMCAwIDEyNyAzMyIgdmVyc2lvbj0iMS4xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIj4KICAgIDx0aXRsZT5jYXJlbG9uLWxvZ28tcjwvdGl0bGU+CiAgICA8ZGVmcz4KICAgICAgICA8cmVjdCBpZD0icGF0aC0xIiB4PSIwIiB5PSIwIiB3aWR0aD0iMTI3IiBoZWlnaHQ9IjMzIj48L3JlY3Q+CiAgICA8L2RlZnM+CiAgICA8ZyBpZD0iMC4wLUNhcmVsb24tSW5zaWdodHMtKEhvbWUpIiBzdHJva2U9Im5vbmUiIHN0cm9rZS13aWR0aD0iMSIgZmlsbD0ibm9uZSIgZmlsbC1ydWxlPSJldmVub2RkIj4KICAgICAgICA8ZyBpZD0iY2FyZWxvbi1sb2dvLXIiPgogICAgICAgICAgICA8bWFzayBpZD0ibWFzay0yIiBmaWxsPSJ3aGl0ZSI+CiAgICAgICAgICAgICAgICA8dXNlIHhsaW5rOmhyZWY9IiNwYXRoLTEiPjwvdXNlPgogICAgICAgICAgICA8L21hc2s+CiAgICAgICAgICAgIDxnIGlkPSJNYXNrIj48L2c+CiAgICAgICAgICAgIDxnIGlkPSJjcmxfcl9oX3JnYl9jIiBtYXNrPSJ1cmwoI21hc2stMikiPgogICAgICAgICAgICAgICAgPGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMC4wMDAwMDAsIDQuMDAwMDAwKSI+CiAgICAgICAgICAgICAgICAgICAgPHBhdGggZD0iTTEyNS44MDIzMTYsMTkuMDg1NTkyOSBMMTI1LjgwMjMxNiwxOS4zNzkyOSBMMTI2LjAwNzM1LDE5LjM3OTI5IEMxMjYuMTE3MjM2LDE5LjM3OTI5IDEyNi4yMTc0MjcsMTkuMzYwNjk2NSAxMjYuMjE3NDI3LDE5LjIzMDE2NCBDMTI2LjIxNzQyNywxOS4xMDQ1NjU2IDEyNi4xMTcyMzYsMTkuMDg1NTkyOSAxMjYuMDA3MzUsMTkuMDg1NTkyOSBMMTI1LjgwMjMxNiwxOS4wODU1OTI5IFogTTEyNywxOS40NjY4OTUgQzEyNywyMC4wNDUwOTMgMTI2LjU3MDAyOSwyMC40ODM4NzEgMTI1Ljk3ODMzOSwyMC40ODM4NzEgQzEyNS40MDA2MzcsMjAuNDgzODcxIDEyNC45NTE2MTMsMjAuMDI2NDc4MiAxMjQuOTUxNjEzLDE5LjQ2Njg5NSBDMTI0Ljk1MTYxMywxOC45MDIzNzM2IDEyNS40MDA2MzcsMTguNDM1NDgzOSAxMjUuOTc4MzM5LDE4LjQzNTQ4MzkgQzEyNi41NTYwMzEsMTguNDM1NDgzOSAxMjcsMTguOTAyMzczNiAxMjcsMTkuNDY2ODk1IFogTTEyNS4xNDc1NSwxOS40NjY4OTUgQzEyNS4xNDc1NSwxOS45MjM5MDcyIDEyNS41MDU1OTksMjAuMzA2NDYwMSAxMjUuOTc4MzM5LDIwLjMwNjQ2MDEgQzEyNi40NjA0MDQsMjAuMzA2NDYwMSAxMjYuODA5MTE3LDE5Ljk0MjUyMiAxMjYuODA5MTE3LDE5LjQ2Njg5NSBDMTI2LjgwOTExNywxOS4wMDAwMDUyIDEyNi40NDYwMTQsMTguNjE3NDUyMyAxMjUuOTc4MzM5LDE4LjYxNzQ1MjMgQzEyNS41MDU1OTksMTguNjE3NDUyMyAxMjUuMTQ3NTUsMTkuMDAwMDA1MiAxMjUuMTQ3NTUsMTkuNDY2ODk1IFogTTEyNS41ODE4MDIsMTguOTExNDkwMSBMMTI2LjAwMjA1NSwxOC45MTE0OTAxIEMxMjYuMTY0NTQ4LDE4LjkxMTQ5MDEgMTI2LjQxNzYzNSwxOC45NTgyMTggMTI2LjQxNzYzNSwxOS4yMjg3MDE2IEMxMjYuNDE3NjM1LDE5LjQzNDIyNDMgMTI2LjI1OTgwNCwxOS41MDg2ODM1IDEyNi4xMTY3MzUsMTkuNTI3Mjk4MyBMMTI2LjQ4NDEwOSwyMC4wMDMzMDQ1IEwxMjYuMjQ1NDE0LDIwLjAwMzMwNDUgTDEyNS44OTcwODIsMTkuNTM2Nzk1MyBMMTI1Ljc4NzA2NSwxOS41MzY3OTUzIEwxMjUuNzg3MDY1LDIwLjAwMzMwNDUgTDEyNS41ODE4MDIsMjAuMDAzMzA0NSBMMTI1LjU4MTgwMiwxOC45MTE0OTAxIFoiIGlkPSJMZWdhbF9NYXJrIiBmaWxsPSIjNTAwOUI1IiBmaWxsLXJ1bGU9Im5vbnplcm8iPjwvcGF0aD4KICAgICAgICAgICAgICAgICAgICA8cGF0aCBkPSJNNDAuNDYxNjcyLDkuNDk4MTg3NzMgQzM4LjA1OTMzNDYsOS40OTgxODc3MyAzNi40Mzc2NTc4LDExLjM2Njk4MjggMzYuNDM3NjU3OCwxMy43MjU5NjY3IEMzNi40Mzc2NTc4LDE2LjA4NDk1MDYgMzguMDg5MzgzMSwxNy45ODQ0MDE0IDQwLjQzMTYyNjcsMTcuOTg0NDAxNCBDNDEuOTAzMDc3MSwxNy45ODQ0MDE0IDQzLjA3NDA2MTUsMTcuNDYzNTU4NSA0My45NzQ5MDY2LDE2LjU0NDQ4NzEgTDQ1LjgzNjk1NTQsMTkuMzAxOTc0NyBDNDQuNjk1NzQxNiwyMC41ODg2MTc4IDQyLjYyMzY0MDYsMjEuNTA3Njg5MiA0MC4zNDE0ODc2LDIxLjUwNzY4OTIgQzM2LjA3NzM3MjgsMjEuNTA3Njg5MiAzMi43NzQxOTM1LDE4LjAxNTA1NDYgMzIuNzc0MTkzNSwxMy43NTY2MjE2IEMzMi43NzQxOTM1LDkuNDY3NTMzNjQgMzYuMDc3MzcyNyw1Ljk3NDg5OTEz..."
  alt="Hospital logo"
  className="carelon-logo"
/>
  <span>Wellness Program Demo</span>
</nav>
      <main>
        <div className="carelon-card">
          <h1>Join a Carelon Wellness Program</h1>
          <form onSubmit={submit}>
            <label>
              Name
              <input placeholder="Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            </label>
            <label>
              Email
              <input placeholder="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
            </label>
            <label>
              Phone <span className="small-text">(E.164 format e.g. +15558675309)</span>
              <input placeholder="+1..." value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} required />
            </label>
            <label>
              Program
              <select value={form.program} onChange={e => setForm(f => ({ ...f, program: e.target.value }))}>
                <option>Weight Loss</option>
                <option>Heart Health</option>
                <option>Diabetes Prevention</option>
              </select>
            </label>
            <button className="carelon-btn" type="submit">Join Program</button>
          </form>
          <div className="carelon-status">{msg}</div>
          <p className="carelon-small">
            * You will receive a real SMS and a phone call on the number entered above.
          </p>
        </div>
      </main>
      <footer className="carelon-footer">
        &copy; {new Date().getFullYear()} Carelon Health. Demo Only.
      </footer>
    </div>
  );
}

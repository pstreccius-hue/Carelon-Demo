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
  src="data:image/svg+xml;utf8,<svg width='40' height='40' viewBox='0 0 24 24' fill='white' xmlns='http://www.w3.org/2000/svg'><rect x='9' y='2' width='6' height='20' rx='2'/><rect x='2' y='9' width='20' height='6' rx='2'/></svg>"
  alt="Hospital"
  className="carelon-logo"
  style={{ background: '#00154d', borderRadius: 8, padding: 2 }}
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
              <input placeholder="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}  />
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

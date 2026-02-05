import React, { useState } from "react";

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
      if (data.success) setMsg("Success! Check your messages.");
      else setMsg(`Failed: ${data.error}`);
    } catch (err) {
      setMsg(`Failed: ${err.toString()}`);
    }
  };

  return (
    <main>
      <h1>Carelon Health Program Demo</h1>
      <form onSubmit={submit}>
        <input placeholder="Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
        <input placeholder="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
        <input placeholder="Phone (+15555555555)" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} required />
        <select value={form.program} onChange={e => setForm(f => ({ ...f, program: e.target.value }))}>
          <option>Weight Loss</option>
          <option>Heart Health</option>
          <option>Diabetes Prevention</option>
        </select>
        <button type="submit">Join Program</button>
      </form>
      <div style={{ minHeight: 40 }}>{msg}</div>
    </main>
  );
}

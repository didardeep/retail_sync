import { useState } from 'react'

import { api } from '../api/client'
import { ErrorNote } from '../components/Loader'

/** An auditor can suggest a question; it stays PENDING until the
 *  Audit Manager approves it, so the bank can't drift uncontrolled. */
export default function ProposeQuestion() {
  const [form, setForm] = useState({
    text: '', process: 'Cashiering', sub_process: '',
    audit_type: 'Store Visit', weight: 3, is_critical: false,
  })
  const [done, setDone] = useState(null)
  const [err, setErr] = useState(null)

  function set(field) {
    return (e) =>
      setForm({
        ...form,
        [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
      })
  }

  async function submit(e) {
    e.preventDefault()
    setErr(null)
    try {
      const q = await api.createQuestion({ ...form, weight: Number(form.weight) })
      setDone(q)
      setForm({ ...form, text: '', sub_process: '' })
    } catch (e2) {
      setErr(e2)
    }
  }

  return (
    <>
      <h2 className="page-title">Propose a Question</h2>
      <p className="page-sub">Submitted questions go to the Audit Manager for approval</p>

      <form className="card" onSubmit={submit}>
        <label className="field">
          <span>Question</span>
          <textarea value={form.text} onChange={set('text')} required />
        </label>
        <div className="row">
          <label className="field">
            <span>Process</span>
            <select value={form.process} onChange={set('process')}>
              {['Cashiering', 'HR & Admin and Operations', 'Inventory Management',
                'EHS & Compliance'].map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Sub-process</span>
            <input value={form.sub_process} onChange={set('sub_process')} />
          </label>
          <label className="field">
            <span>Audit type</span>
            <select value={form.audit_type} onChange={set('audit_type')}>
              {['Store Visit', 'Structured data analysis',
                'Unstructured data analysis'].map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Weight (1–5)</span>
            <input type="number" min="1" max="5" value={form.weight} onChange={set('weight')} />
          </label>
        </div>
        <label className="field" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="checkbox"
            style={{ width: 16 }}
            checked={form.is_critical}
            onChange={set('is_critical')}
          />
          <span style={{ margin: 0 }}>Mark as critical</span>
        </label>
        <button className="btn">Submit for approval</button>
        {done && (
          <p style={{ color: 'var(--green)' }}>
            Submitted as {done.code} — status {done.approval_status}.
          </p>
        )}
        <ErrorNote error={err} />
      </form>
    </>
  )
}

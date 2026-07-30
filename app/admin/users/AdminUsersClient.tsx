'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import { AppShell, Field, Surface } from '@/components/AppShell'
import type { Profile } from '@/lib/types'

export function AdminUsersClient(props: { profile: Profile; initialUsers: Profile[] }) {
  const { profile } = props
  const [users, setUsers] = useState<Profile[]>(props.initialUsers)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('password')
  const [isAdmin, setIsAdmin] = useState(false)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/users')
    const json = await res.json()
    setUsers(json.data ?? [])
    setLoading(false)
  }

  async function create(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), email: email.trim(), password, is_admin: isAdmin }),
    })
    const json = await res.json()
    if (!res.ok) {
      setError(json.message ?? 'Request failed')
      return
    }
    setName('')
    setEmail('')
    setPassword('password')
    setIsAdmin(false)
    await load()
  }

  async function disable(userId: string) {
    await fetch(`/api/admin/users/${userId}/disable`, { method: 'POST' })
    await load()
  }

  async function enable(userId: string) {
    await fetch(`/api/admin/users/${userId}/enable`, { method: 'POST' })
    await load()
  }

  return (
    <AppShell
      title="User Management"
      subtitle="Create, enable, and disable user accounts."
      profile={profile}
      actions={
        <button
          onClick={load}
          className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-500"
        >
          Refresh
        </button>
      }
    >
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.6fr]">
        <Surface title="Add / Edit User">
          {error ? (
            <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>
          ) : null}
          <form onSubmit={create} className="space-y-3">
            <Field placeholder="Name" label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <Field
              placeholder="Email"
              label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
            />
            <Field
              placeholder="Password"
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="text"
              required
            />
            <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <span className="text-sm font-medium text-slate-700">Admin role</span>
              <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
            </label>
            <button className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-600">
              Save User
            </button>
          </form>
        </Surface>

        <Surface title="Users">
          {loading ? (
            <div className="text-sm text-slate-500">Loading...</div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="px-4 py-3 font-medium text-slate-900">{u.name}</td>
                      <td className="px-4 py-3 text-slate-600">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                          {u.is_admin ? 'Admin' : 'User'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {u.disabled_at ? (
                          <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">
                            Disabled
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {u.disabled_at ? (
                          <button
                            onClick={() => enable(u.id)}
                            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Enable
                          </button>
                        ) : (
                          <button
                            onClick={() => disable(u.id)}
                            className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                          >
                            Disable
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Surface>
      </div>
    </AppShell>
  )
}

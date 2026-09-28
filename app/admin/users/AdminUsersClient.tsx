'use client'

import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { AppShell, Field, Surface } from '@/components/AppShell'
import { useFeedback } from '@/components/Notifications'
import type { Profile } from '@/lib/types'

export function AdminUsersClient(props: {
  profile: Profile
  initialUsers: Profile[]
}) {
  const { profile } = props
  const [users, setUsers] = useState<Profile[]>(props.initialUsers)
  const [loading, setLoading] = useState(false)
  const feedback = useFeedback()
  const pending = useRef(false)
  const [busy, setBusy] = useState(false)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('password')
  const [isAdmin, setIsAdmin] = useState(false)

  async function request(url: string, options?: RequestInit) {
    const res = await fetch(url, options)
    const json = await res.json()
    if (!res.ok)
      throw new Error(json.message ?? 'Request failed. Please try again.')
    return json
  }
  async function fetchUsers() {
    const json = await request('/api/admin/users')
    setUsers(json.data ?? [])
  }
  async function load() {
    setLoading(true)
    await feedback(fetchUsers, 'User list refreshed.')
    setLoading(false)
  }
  async function mutate(operation: () => Promise<void>, success: string) {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    try {
      await feedback(operation, success)
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  async function create(e: FormEvent) {
    e.preventDefault()
    await mutate(async () => {
      await request('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
          is_admin: isAdmin,
        }),
      })
      setName('')
      setEmail('')
      setPassword('password')
      setIsAdmin(false)
      await fetchUsers()
    }, 'User account created.')
  }
  async function disable(userId: string) {
    await mutate(async () => {
      await request('/api/admin/users/' + userId + '/disable', {
        method: 'POST',
      })
      await fetchUsers()
    }, 'User account disabled.')
  }
  async function enable(userId: string) {
    await mutate(async () => {
      await request('/api/admin/users/' + userId + '/enable', {
        method: 'POST',
      })
      await fetchUsers()
    }, 'User account enabled.')
  }

  return (
    <AppShell
      title="People"
      subtitle="Manage the people in your teaching workspace."
      profile={profile}
      actions={
        <button
          onClick={load}
          disabled={loading || busy}
          className="btn btn-primary "
        >
          Refresh
        </button>
      }
    >
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.6fr]">
        <Surface
          title="Add a member"
          subtitle="Create an account for a teacher or administrator."
        >
          <form onSubmit={create}>
            <fieldset disabled={busy} className="space-y-3">
              <Field
                placeholder="Name"
                label="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
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
              <label className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
                <span className="text-sm font-medium text-slate-700">
                  Admin role
                </span>
                <input
                  type="checkbox"
                  checked={isAdmin}
                  onChange={(e) => setIsAdmin(e.target.checked)}
                />
              </label>
              <button className="btn btn-primary w-full">Create account</button>
            </fieldset>
          </form>
        </Surface>

        <Surface
          title="Workspace members"
          subtitle={`${users.length} accounts in your workspace`}
        >
          {loading ? (
            <div className="text-sm text-slate-500">Loading...</div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-200">
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
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {u.name}
                      </td>
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
                            disabled={busy}
                            className="btn "
                          >
                            Enable
                          </button>
                        ) : (
                          <button
                            onClick={() => disable(u.id)}
                            disabled={busy}
                            className="rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
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

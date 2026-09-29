'use client'

import { useEffect, useRef, useState } from 'react'
import { AppShell, Field, Surface } from '@/components/AppShell'
import { useFeedback } from '@/components/Notifications'
import { createClient } from '@/lib/supabase/client'
import type { ClassSection, Profile, RosterStudent } from '@/lib/types'

export function ClassesClient({
  profile,
  initialClasses,
}: {
  profile: Profile
  initialClasses: ClassSection[]
}) {
  const [classes, setClasses] = useState(initialClasses)
  const [selected, setSelected] = useState<number | null>(
    initialClasses[0]?.id ?? null,
  )
  const [className, setClassName] = useState('')
  const [students, setStudents] = useState<RosterStudent[]>([])
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const pending = useRef(false)
  const feedback = useFeedback()
  const current = classes.find((c) => c.id === selected)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError('')
      setStudents([])
      setEditing(null)
      setFirstName('')
      setLastName('')
      if (selected !== null) {
        const { data, error } = await createClient()
          .from('class_students')
          .select('*')
          .eq('class_id', selected)
          .order('last_name')
          .order('first_name')
        if (cancelled) return
        if (error) setLoadError(error.message)
        else setStudents(data ?? [])
      }
      if (!cancelled) setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [selected])

  async function mutate(action: () => Promise<void>, message: string) {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    try {
      await feedback(action, message)
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return (
    <AppShell
      profile={profile}
      title="Classes & students"
      subtitle="Create a section, then register the names allowed to take its quizzes."
    >
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Surface title="Your classes">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              void mutate(async () => {
                const { data, error } = await createClient()
                  .from('classes')
                  .insert({ user_id: profile.id, name: className.trim() })
                  .select()
                  .single()
                if (error) throw error
                setClasses((prev) =>
                  [...prev, data].sort((a, b) => a.name.localeCompare(b.name)),
                )
                setSelected(data.id)
                setClassName('')
              }, 'Class created.')
            }}
          >
            <Field
              label="Class / section name"
              required
              maxLength={120}
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              placeholder="Grade 10 — Section A"
            />
            <button className="btn btn-primary" disabled={busy}>
              Create class
            </button>
          </form>
          <div className="mt-5 flex flex-col gap-2">
            {classes.map((c) => (
              <button
                key={c.id}
                className={`btn text-left ${selected === c.id ? 'btn-primary' : ''}`}
                aria-pressed={selected === c.id}
                disabled={busy}
                onClick={() => setSelected(c.id)}
              >
                {c.name}
              </button>
            ))}
            {!classes.length && (
              <p className="text-sm text-slate-500">
                Create your first class to get started.
              </p>
            )}
          </div>
        </Surface>
        <Surface
          title={current?.name ?? 'Student roster'}
          subtitle="Enter names exactly as students should type them. Capitalization and extra spaces are ignored."
        >
          {current ? (
            <>
              <div className="mb-5 flex gap-2">
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => {
                    const name = prompt('Class / section name', current.name)
                    if (!name?.trim()) return
                    void mutate(async () => {
                      const { data, error } = await createClient()
                        .from('classes')
                        .update({ name: name.trim() })
                        .eq('id', current.id)
                        .select()
                        .single()
                      if (error) throw error
                      setClasses((prev) =>
                        prev.map((c) => (c.id === data.id ? data : c)),
                      )
                    }, 'Class renamed.')
                  }}
                >
                  Rename class
                </button>
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => {
                    if (
                      !confirm(
                        `Delete ${current.name} and its roster? Its quiz assignments will be removed. Past submissions will be kept.`,
                      )
                    )
                      return
                    void mutate(async () => {
                      const { error } = await createClient()
                        .from('classes')
                        .delete()
                        .eq('id', current.id)
                        .select('id')
                        .single()
                      if (error) throw error
                      const next = classes.filter((c) => c.id !== current.id)
                      setClasses(next)
                      setSelected(next[0]?.id ?? null)
                    }, 'Class deleted.')
                  }}
                >
                  Delete class
                </button>
              </div>
              <form
                className="mb-6 flex flex-wrap items-end gap-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  void mutate(
                    async () => {
                      const client = createClient()
                      const values = {
                        class_id: current.id,
                        first_name: firstName.trim().replace(/\s+/g, ' '),
                        last_name: lastName.trim().replace(/\s+/g, ' '),
                      }
                      const query = editing
                        ? client
                            .from('class_students')
                            .update(values)
                            .eq('id', editing)
                        : client.from('class_students').insert(values)
                      const { data, error } = await query.select().single()
                      if (error)
                        throw new Error(
                          error.code === '23505'
                            ? 'This name is already registered in this class.'
                            : error.message,
                        )
                      setStudents((prev) =>
                        [...prev.filter((s) => s.id !== data.id), data].sort(
                          (a, b) =>
                            a.last_name.localeCompare(b.last_name) ||
                            a.first_name.localeCompare(b.first_name),
                        ),
                      )
                      setEditing(null)
                      setFirstName('')
                      setLastName('')
                    },
                    editing ? 'Student updated.' : 'Student registered.',
                  )
                }}
              >
                <Field
                  label="First name"
                  required
                  maxLength={100}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
                <Field
                  label="Last name"
                  required
                  maxLength={100}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
                <button className="btn btn-primary" disabled={busy || loading}>
                  {editing ? 'Save student' : 'Register student'}
                </button>
                {editing && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setEditing(null)
                      setFirstName('')
                      setLastName('')
                    }}
                  >
                    Cancel
                  </button>
                )}
              </form>
              {loadError && (
                <p role="alert" className="text-red-600">
                  {loadError}
                </p>
              )}
              {loading ? (
                <p role="status">Loading students…</p>
              ) : (
                <>
                  <p className="mb-3 text-sm text-slate-500">
                    {students.length} registered students
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr>
                          <th className="py-3">First name</th>
                          <th>Last name</th>
                          <th>
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {students.map((s) => (
                          <tr key={s.id} className="border-t border-slate-200">
                            <td className="py-3">{s.first_name}</td>
                            <td>{s.last_name}</td>
                            <td className="flex justify-end gap-2 py-2">
                              <button
                                className="btn"
                                disabled={busy}
                                onClick={() => {
                                  setEditing(s.id)
                                  setFirstName(s.first_name)
                                  setLastName(s.last_name)
                                }}
                              >
                                Edit
                              </button>
                              <button
                                className="btn"
                                disabled={busy}
                                onClick={() => {
                                  if (
                                    !confirm(
                                      `Remove ${s.first_name} ${s.last_name} from this class? Past submissions will be kept.`,
                                    )
                                  )
                                    return
                                  void mutate(async () => {
                                    const { error } = await createClient()
                                      .from('class_students')
                                      .delete()
                                      .eq('id', s.id)
                                      .select('id')
                                      .single()
                                    if (error) throw error
                                    setStudents((prev) =>
                                      prev.filter((row) => row.id !== s.id),
                                    )
                                    if (editing === s.id) {
                                      setEditing(null)
                                      setFirstName('')
                                      setLastName('')
                                    }
                                  }, 'Student removed.')
                                }}
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-500">
              Choose a class to manage its students.
            </p>
          )}
        </Surface>
      </div>
    </AppShell>
  )
}

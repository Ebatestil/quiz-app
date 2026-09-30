'use client'

import { useEffect, useRef, useState } from 'react'
import { AppShell, Field, Icon } from '@/components/AppShell'
import { useFeedback } from '@/components/Notifications'
import { createClient } from '@/lib/supabase/client'
import type { ClassSection, Profile, RosterStudent } from '@/lib/types'

export function ClassesClient({
  profile,
  initialClasses,
}: {
  profile: Profile
  initialClasses: (ClassSection & { student_count: number })[]
}) {
  const [classes, setClasses] = useState(initialClasses)
  const [selected, setSelected] = useState<number | null>(null)
  const [className, setClassName] = useState('')
  const [search, setSearch] = useState('')
  const [formError, setFormError] = useState('')
  const [classForm, setClassForm] = useState<'new' | ClassSection | null>(null)
  const [studentForm, setStudentForm] = useState(false)
  const [reload, setReload] = useState(0)
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
      setStudentForm(false)
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
  }, [selected, reload])

  async function mutate(action: () => Promise<void>, message: string) {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setFormError('')
    try {
      await feedback(async () => {
        try {
          await action()
        } catch (error) {
          setFormError(
            error && typeof error === 'object' && 'message' in error
              ? String(error.message)
              : 'Unable to save. Please try again.',
          )
          throw error
        }
      }, message)
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  const visibleClasses = classes.filter((c) =>
    c.name.toLowerCase().includes(search.trim().toLowerCase()),
  )
  const visibleStudents = students.filter((s) =>
    (s.first_name + ' ' + s.last_name)
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  )
  function openClass(id: number | null) {
    if (busy) return
    setLoading(id !== null)
    setStudents([])
    setSelected(id)
    setSearch('')
  }
  function editClass(section: ClassSection | 'new') {
    setFormError('')
    setClassName(section === 'new' ? '' : section.name)
    setClassForm(section)
  }
  function editStudent(student?: RosterStudent) {
    setFormError('')
    setEditing(student?.id ?? null)
    setFirstName(student?.first_name ?? '')
    setLastName(student?.last_name ?? '')
    setStudentForm(true)
  }
  async function saveClass() {
    await mutate(
      async () => {
        if (!className.trim()) throw new Error('Enter a class name.')
        const client = createClient()
        const query =
          classForm === 'new'
            ? client
                .from('classes')
                .insert({ user_id: profile.id, name: className.trim() })
            : client
                .from('classes')
                .update({ name: className.trim() })
                .eq('id', (classForm as ClassSection).id)
        const { data, error } = await query.select().single()
        if (error)
          throw new Error(
            error.code === '23505'
              ? 'A class with this name already exists.'
              : error.message,
          )
        setClasses((prev) =>
          [
            ...prev.filter((c) => c.id !== data.id),
            {
              ...data,
              student_count:
                prev.find((c) => c.id === data.id)?.student_count ?? 0,
            },
          ].sort((a, b) => a.name.localeCompare(b.name)),
        )
        setClassForm(null)
      },
      classForm === 'new' ? 'Class created.' : 'Class updated.',
    )
  }
  async function deleteClass(section: ClassSection) {
    if (
      !confirm(
        'Delete ' +
          section.name +
          ' and its roster? Quiz assignments will be removed. Past submissions will be kept.',
      )
    )
      return
    await mutate(async () => {
      const { error } = await createClient()
        .from('classes')
        .delete()
        .eq('id', section.id)
        .select('id')
        .single()
      if (error) throw error
      setClasses((prev) => prev.filter((c) => c.id !== section.id))
      if (selected === section.id) {
        setSelected(null)
        setSearch('')
      }
    }, 'Class deleted.')
  }
  async function saveStudent() {
    if (!current) return
    await mutate(
      async () => {
        const values = {
          class_id: current.id,
          first_name: firstName.trim().replace(/\s+/g, ' '),
          last_name: lastName.trim().replace(/\s+/g, ' '),
        }
        if (!values.first_name || !values.last_name)
          throw new Error('Enter both first and last names.')
        const client = createClient()
        const query = editing
          ? client.from('class_students').update(values).eq('id', editing)
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
        if (!editing)
          setClasses((prev) =>
            prev.map((c) =>
              c.id === current.id
                ? { ...c, student_count: c.student_count + 1 }
                : c,
            ),
          )
        setStudentForm(false)
      },
      editing ? 'Student updated.' : 'Student registered.',
    )
  }
  async function removeStudent(student: RosterStudent) {
    if (
      !confirm(
        'Remove ' +
          student.first_name +
          ' ' +
          student.last_name +
          ' from this class? Past submissions will be kept.',
      )
    )
      return
    await mutate(async () => {
      const { error } = await createClient()
        .from('class_students')
        .delete()
        .eq('id', student.id)
        .select('id')
        .single()
      if (error) throw error
      setStudents((prev) => prev.filter((s) => s.id !== student.id))
      setClasses((prev) =>
        prev.map((c) =>
          c.id === student.class_id
            ? { ...c, student_count: Math.max(0, c.student_count - 1) }
            : c,
        ),
      )
    }, 'Student removed.')
  }

  return (
    <AppShell
      profile={profile}
      title={current ? current.name : 'Classes'}
      subtitle={
        current
          ? 'Manage the students registered in this section.'
          : 'Organize your sections and manage their student rosters.'
      }
    >
      {current && (
        <button
          className="btn mb-5"
          disabled={busy}
          onClick={() => openClass(null)}
        >
          ← All classes
        </button>
      )}
      <section
        className="roster-panel"
        aria-label={current ? 'Student roster' : 'Classes list'}
      >
        <header className="roster-toolbar">
          <div>
            <h2>{current ? 'Students' : 'Classes'}</h2>
            <p>
              {current
                ? loading
                  ? 'Loading roster…'
                  : students.length + ' registered students'
                : classes.length + ' classes'}
              {!current && ' · Select a class to view its students'}
            </p>
          </div>
          <label className="roster-search">
            <Icon name="search" />
            <span className="sr-only">
              {current ? 'Search students' : 'Search classes'}
            </span>
            <input
              type="search"
              placeholder={current ? 'Search students…' : 'Search classes…'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <button
            className="btn roster-add"
            disabled={
              busy || (current !== undefined && (loading || !!loadError))
            }
            onClick={() => (current ? editStudent() : editClass('new'))}
          >
            <Icon name="plus" />
            {current ? 'Add student' : 'Add class'}
          </button>
        </header>
        {loadError && current ? (
          <div className="roster-empty" role="alert">
            <p>{loadError}</p>
            <button
              className="btn mt-3"
              onClick={() => setReload((n) => n + 1)}
            >
              Try again
            </button>
          </div>
        ) : loading && current ? (
          <p className="roster-empty" role="status">
            Loading students…
          </p>
        ) : (
          <div className="roster-table-scroll">
            <table className="roster-table">
              <thead>
                <tr>
                  {current ? (
                    <>
                      <th scope="col">First name</th>
                      <th scope="col">Last name</th>
                    </>
                  ) : (
                    <>
                      <th scope="col">Class / section</th>
                      <th scope="col">Students</th>
                    </>
                  )}
                  <th scope="col" className="roster-actions-heading">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {current
                  ? visibleStudents.map((student) => (
                      <tr key={student.id}>
                        <td>{student.first_name}</td>
                        <td>{student.last_name}</td>
                        <td>
                          <div className="roster-actions">
                            <button
                              className="roster-edit"
                              disabled={busy}
                              onClick={() => editStudent(student)}
                              aria-label={
                                'Edit ' +
                                student.first_name +
                                ' ' +
                                student.last_name
                              }
                            >
                              <RowIcon />
                              Edit
                            </button>
                            <button
                              className="roster-delete"
                              disabled={busy}
                              onClick={() => void removeStudent(student)}
                              aria-label={
                                'Remove ' +
                                student.first_name +
                                ' ' +
                                student.last_name
                              }
                            >
                              <RowIcon remove />
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  : visibleClasses.map((section) => (
                      <tr
                        key={section.id}
                        className="roster-class-row"
                        onClick={() => openClass(section.id)}
                      >
                        <td>
                          <button
                            className="roster-class-link"
                            disabled={busy}
                            onClick={(e) => {
                              e.stopPropagation()
                              openClass(section.id)
                            }}
                          >
                            {section.name}
                            <span aria-hidden="true"> →</span>
                          </button>
                        </td>
                        <td>
                          <span className="roster-count">
                            {section.student_count}
                          </span>
                        </td>
                        <td>
                          <div
                            className="roster-actions"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              className="roster-edit"
                              disabled={busy}
                              onClick={() => editClass(section)}
                              aria-label={'Edit ' + section.name}
                            >
                              <RowIcon />
                              Edit
                            </button>
                            <button
                              className="roster-delete"
                              disabled={busy}
                              onClick={() => void deleteClass(section)}
                              aria-label={'Delete ' + section.name}
                            >
                              <RowIcon remove />
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
            {(current ? visibleStudents : visibleClasses).length === 0 && (
              <div className="roster-empty">
                {search
                  ? 'No matches. Try a different name.'
                  : current
                    ? 'No students yet. Add your first student to this class.'
                    : 'No classes yet. Add a class to get started.'}
              </div>
            )}
          </div>
        )}
      </section>
      {classForm && (
        <RosterDialog
          title={classForm === 'new' ? 'Add class' : 'Edit class'}
          busy={busy}
          onClose={() => setClassForm(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void saveClass()
            }}
          >
            <fieldset disabled={busy} className="space-y-5">
              {formError && (
                <p role="alert" className="text-sm text-red-600">
                  {formError}
                </p>
              )}
              <Field
                autoFocus
                label="Class / section name"
                required
                maxLength={120}
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                placeholder="Grade 10 — Section A"
              />
              <div className="roster-dialog-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setClassForm(null)}
                >
                  Cancel
                </button>
                <button className="btn roster-add">
                  {busy
                    ? 'Saving…'
                    : classForm === 'new'
                      ? 'Add class'
                      : 'Save changes'}
                </button>
              </div>
            </fieldset>
          </form>
        </RosterDialog>
      )}
      {studentForm && current && (
        <RosterDialog
          title={editing ? 'Edit student' : 'Add student'}
          busy={busy}
          onClose={() => setStudentForm(false)}
        >
          <p className="mb-5 text-sm text-slate-500">
            {current.name} · Use the names the student will enter when taking a
            quiz.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void saveStudent()
            }}
          >
            <fieldset disabled={busy} className="space-y-5">
              {formError && (
                <p role="alert" className="text-sm text-red-600">{formError}</p>
              )}
              <Field
                autoFocus
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
              <div className="roster-dialog-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setStudentForm(false)}
                >
                  Cancel
                </button>
                <button className="btn roster-add">
                  {busy ? 'Saving…' : editing ? 'Save changes' : 'Add student'}
                </button>
              </div>
            </fieldset>
          </form>
        </RosterDialog>
      )}
    </AppShell>
  )
}

function RosterDialog({
  title,
  busy,
  onClose,
  children,
}: {
  title: string
  busy: boolean
  onClose: () => void
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => {
      dialog?.close()
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className="roster-dialog"
      aria-labelledby="roster-dialog-title"
      onCancel={(e) => {
        e.preventDefault()
        if (!busy) onClose()
      }}
    >
      <div className="roster-dialog-heading">
        <h2 id="roster-dialog-title">{title}</h2>
        <button
          type="button"
          aria-label="Close form"
          className="btn"
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  )
}
function RowIcon({ remove = false }: { remove?: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {remove ? (
        <>
          <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
        </>
      ) : (
        <>
          <path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z" />
        </>
      )}
    </svg>
  )
}

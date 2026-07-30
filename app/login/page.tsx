import { Suspense } from 'react'
import { LoginForm } from './LoginForm'

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f6f7fb]" />}>
      <LoginForm />
    </Suspense>
  )
}

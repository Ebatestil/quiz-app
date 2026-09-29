import type { Metadata } from 'next'
import { Poppins } from 'next/font/google'
import './globals.css'
import { NotificationProvider } from '@/components/Notifications'

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-poppins',
})

export const metadata: Metadata = {
  title: 'Quiz App',
  description: 'Create quizzes, take them, and track your scores.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${poppins.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <NotificationProvider>{children}</NotificationProvider>
      </body>
    </html>
  )
}

import { DemoClient } from './DemoClient'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Quiz App — Interactive Portfolio Demo',
  description:
    'Create a quiz, share its link, and see results in your temporary workspace.',
}

export default function DemoPage() {
  return <DemoClient />
}

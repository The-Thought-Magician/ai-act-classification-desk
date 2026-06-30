import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AiActClassificationDesk',
  description: 'Classify every AI system into its EU AI Act risk tier and generate the obligation checklist, conformity evidence, and registration package.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100 min-h-screen antialiased">{children}</body>
    </html>
  )
}

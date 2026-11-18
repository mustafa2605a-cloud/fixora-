import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Inter, Poppins } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const poppins = Poppins({ subsets: ['latin'], weight: ['500', '600', '700', '800'], variable: '--font-poppins' })

export const metadata: Metadata = {
  title: {
    default: 'Fixora — Book. Fix. Relax.',
    template: '%s | Fixora',
  },
  description:
    'Fixora connects you with verified local professionals for plumbing, electrical, AC repair, cleaning, carpentry and painting. Book in 60 seconds.',
  generator: 'v0.app',
  icons: {
    icon: '/images/fixora-mark.png',
    apple: '/images/fixora-mark.png',
  },
  openGraph: {
    title: 'Fixora — Book. Fix. Relax.',
    description: 'On-demand home services from verified professionals.',
    images: ['/images/fixora-logo.jpg'],
  },
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f5a623',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${poppins.variable} bg-background`}>
      <body className="font-sans antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}

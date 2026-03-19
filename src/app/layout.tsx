import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'
import { ReduxProvider } from '@/store/provider'

const geistSans = Geist({
    subsets: ['latin'],
})

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <ClerkProvider>
            <html lang="en">
                <body className={geistSans.className}>
                    <ReduxProvider>
                        {children}
                    </ReduxProvider>
                </body>
            </html>
        </ClerkProvider>
    )
}
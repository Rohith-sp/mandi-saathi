import "./globals.css"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Mandi Saathi",
  description: "Voice agent for small farmers",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

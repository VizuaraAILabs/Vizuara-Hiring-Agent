import type { Metadata } from "next";
import { Figtree, Instrument_Serif, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/context/AuthContext";
import { SubscriptionProvider } from "@/context/SubscriptionContext";
import Header from "@/components/Header";
import FeedbackTab from "@/components/feedback/FeedbackTab";
import "./globals.css";

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ArcEval - AI Collaboration Assessment Platform",
  description: "Evaluate how candidates collaborate with AI coding assistants",
  icons: {
    icon: "/vizuara-logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${figtree.variable} ${instrumentSerif.variable} ${geistMono.variable} antialiased bg-[#0a0a0a] text-white`}
      >
        <AuthProvider>
          <SubscriptionProvider>
            <Header />
            <FeedbackTab />
            {children}
          </SubscriptionProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

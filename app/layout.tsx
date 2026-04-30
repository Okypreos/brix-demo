import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { cn } from "@/lib/utils";
import { ConvexClientProvider } from "@/components/providers/convex-client-provider";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Brix Scheduling",
  description: "Assign jobs to technicians without overlaps.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // ClerkProvider must wrap ConvexProviderWithClerk so Convex can read
    // the Clerk session via useAuth(). See:
    // https://docs.convex.dev/auth/clerk#nextjs
    //
    // afterSignOutUrl lives on the provider in @clerk/nextjs v7 — the
    // per-component prop on <UserButton/> was removed.
    <ClerkProvider afterSignOutUrl="/">
      <ConvexClientProvider>
        <html
          lang="en"
          className={cn(
            "h-full",
            "antialiased",
            geistSans.variable,
            geistMono.variable,
            "font-sans",
            inter.variable,
          )}
        >
          <body className="min-h-full flex flex-col">
            {children}
            <Toaster richColors closeButton position="top-right" />
          </body>
        </html>
      </ConvexClientProvider>
    </ClerkProvider>
  );
}

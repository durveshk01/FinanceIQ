import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: "FinanceIQ - AI Bank Statement Analyzer & Financial Command Center",
  description:
    "Analyze PDF, CSV, and XLSX bank statements with device-powered financial intelligence, spending insights, subscriptions, forecasts, interactive charts, and exportable financial reports.",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "FinanceIQ - AI Bank Statement Analyzer",
    description:
      "Analyze PDF, CSV, and XLSX bank statements with device-powered financial intelligence, spending insights, subscriptions, forecasts, interactive charts, and exportable financial reports.",
    url: "/",
    siteName: "FinanceIQ",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "FinanceIQ - AI Bank Statement Analyzer",
    description:
      "Analyze PDF, CSV, and XLSX bank statements with device-powered financial intelligence, spending insights, subscriptions, forecasts, interactive charts, and exportable financial reports.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased dark">
      <body className="min-h-full flex flex-col font-sans bg-black text-white selection:bg-rose-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}


import "./globals.css";

export const metadata = {
  title: "NEXORA AI | Project Intelligence",
  description: "AI-Powered Project Management SaaS Platform"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

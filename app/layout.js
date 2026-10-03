import './globals.css';

export const metadata = {
  title: 'Voki Talk',
  description: 'Internet walkie-talkie built with Next.js, WebRTC and Socket.IO',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import './globals.css';

export const metadata = {
  title: 'Birthday Fund',
  description: 'Shared birthday contribution tracker',
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}

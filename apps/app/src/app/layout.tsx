import { EmotionRegistry, Provider, Toaster } from '@inventra-med/components';

export const metadata = {
  title: { default: 'InventraMed', template: '%s | InventraMed' },
  description: 'Medicine inventory and expiration monitoring',
};

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <EmotionRegistry>
          <Provider defaultTheme="dark">
            {props.children}
            <Toaster />
          </Provider>
        </EmotionRegistry>
      </body>
    </html>
  );
}

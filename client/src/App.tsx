import { TicketProvider } from './context/TicketContext.tsx';
import { ThemeProvider } from './context/ThemeProvider.tsx';
import { AppShellPage } from './pages/AppShellPage/AppShellPage.tsx';

export default function App() {
  return (
    <ThemeProvider>
      <TicketProvider>
        <AppShellPage />
      </TicketProvider>
    </ThemeProvider>
  );
}


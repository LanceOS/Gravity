import { TicketProvider } from './context/TicketContext';
import { AppShellPage } from './pages/AppShellPage/AppShellPage.tsx';

export default function App() {
  return (
    <TicketProvider>
      <AppShellPage />
    </TicketProvider>
  );
}

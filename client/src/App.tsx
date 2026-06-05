import { RouterProvider } from 'react-router-dom';
import { TicketProvider } from './context/TicketContext';
import { ThemeProvider } from './modules/settings';
import { router } from './router';

export default function App() {
  return (
    <ThemeProvider>
      <TicketProvider>
        <RouterProvider router={router} />
      </TicketProvider>
    </ThemeProvider>
  );
}


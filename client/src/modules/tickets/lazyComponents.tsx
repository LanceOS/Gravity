import React, { lazy, Suspense } from 'react';
import type { TicketDetailProps } from './types/TicketDetail';
import type { CreateTicketModalProps } from './types/CreateTicketModal';
import { LoadingCreateTicketDialog } from './components/CreateTicketModal/LoadingCreateTicketDialog';

type TicketDetailRouteProps = React.ComponentProps<typeof import('./components/TicketDetailRoute').TicketDetailRoute>;

const Detail = lazy(() => import('./components/TicketDetail/TicketDetail').then(({ TicketDetail }) => ({ default: TicketDetail })));
const DetailRoute = lazy(() => import('./components/TicketDetailRoute').then(({ TicketDetailRoute }) => ({ default: TicketDetailRoute })));
const CreateModal = lazy(() => import('./components/CreateTicketModal/CreateTicketModal').then(({ CreateTicketModal }) => ({ default: CreateTicketModal })));

export function TicketDetail(props: TicketDetailProps) {
  return (
    <Suspense fallback={<div role="status">Loading ticket details...</div>}>
      <Detail {...props} />
    </Suspense>
  );
}

export function TicketDetailRoute(props: TicketDetailRouteProps) {
  return (
    <Suspense fallback={<div role="status">Loading ticket details...</div>}>
      <DetailRoute {...props} />
    </Suspense>
  );
}

export function CreateTicketModal(props: CreateTicketModalProps) {
  return (
    <Suspense fallback={props.isOpen === false ? null : <LoadingCreateTicketDialog onClose={props.onClose} />}>
      <CreateModal {...props} />
    </Suspense>
  );
}

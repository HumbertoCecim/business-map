import { createFileRoute } from '@tanstack/react-router';
import { BusinessApp } from '@/features/business/components/BusinessApp';

export const Route = createFileRoute('/business')({
  head: () => ({ meta: [{ title: 'GrowYourPlan · Seu negócio, em perspectiva' }, { name: 'robots', content: 'noindex, nofollow' }] }),
  component: BusinessApp,
});

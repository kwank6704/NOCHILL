import type { Metadata } from 'next';
import { StatsDashboard } from '@/components/stats/StatsDashboard';

export const metadata: Metadata = { title: 'รายงานความเก็บกด — NO CHILL' };

export default function StatsPage() {
  return <StatsDashboard />;
}

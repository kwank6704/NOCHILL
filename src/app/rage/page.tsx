import type { Metadata } from 'next';
import { RageStage } from '@/components/rage/RageStage';

export const metadata: Metadata = { title: 'สูดความโมโห แล้วปาของ — NO CHILL' };

export default function RagePage() {
  return <RageStage />;
}

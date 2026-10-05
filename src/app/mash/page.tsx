import type { Metadata } from 'next';
import { MashStage } from '@/components/mash/MashStage';

export const metadata: Metadata = { title: 'กดรัวแป้น — NO CHILL' };

export default function MashPage() {
  return <MashStage />;
}

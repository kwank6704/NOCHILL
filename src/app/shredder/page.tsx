import type { Metadata } from 'next';
import { ShredderStage } from '@/components/shredder/ShredderStage';

export const metadata: Metadata = { title: 'เครื่องบดความในใจ — NO CHILL' };

export default function ShredderPage() {
  return <ShredderStage />;
}

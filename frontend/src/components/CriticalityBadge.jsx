import { cn } from '@/lib/utils';
import { criticalityClass, criticalityOf } from '@/lib/criticality';

// "High criticality" chip for a question or an answer row.
export default function CriticalityBadge({ item, className }) {
  const level = criticalityOf(item);
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[10.5px] font-semibold', criticalityClass(level), className)}>
      {level} criticality
    </span>
  );
}

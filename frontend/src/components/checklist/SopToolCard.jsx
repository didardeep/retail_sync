import { Badge } from '@/components/ui/badge';
import Disclosure from './Disclosure';

function Rubric({ label, text, tone }) {
  if (!text) return null;
  return (
    <div className="rounded-md border border-border px-2.5 py-1.5">
      <div className={'text-[10.5px] font-semibold uppercase tracking-wide ' + tone}>{label}</div>
      <div className="text-[12px] leading-snug text-foreground">{text}</div>
    </div>
  );
}

function Criterion({ c, open, onToggle }) {
  return (
    <Disclosure
      open={open}
      onToggle={onToggle}
      className="border-b border-border last:border-0"
      headerClassName="px-4 py-2.5"
      header={
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] leading-snug text-foreground">{c.title}</span>
          <Badge className="bg-sky-50 text-sky-700">{c.marks} marks</Badge>
          {c.requires_photo && <Badge className="bg-amber-50 text-amber-800">Photo required</Badge>}
          {c.requires_comment && <Badge className="bg-violet-50 text-violet-800">Comment required</Badge>}
          {c.default_na && <Badge className="bg-gray-100 text-gray-600">N/A by default</Badge>}
        </div>
      }
    >
      <div className="grid gap-2 bg-muted/10 px-4 pb-3 pt-1 md:grid-cols-3">
        <Rubric label="Best" text={c.max_text} tone="text-emerald-700" />
        <Rubric label="Average" text={c.avg_text} tone="text-amber-700" />
        <Rubric label="Least" text={c.min_text} tone="text-red-700" />
      </div>
    </Disclosure>
  );
}

export default function SopToolCard({ tool, isOpen, toggle }) {
  const qCount = (tool.sections || []).reduce((n, s) => n + (s.criteria || []).length, 0);
  return (
    <Disclosure
      open={isOpen('t:' + tool.id)}
      onToggle={() => toggle('t:' + tool.id)}
      className="overflow-hidden rounded-[10px] border border-border bg-card"
      headerClassName="px-4 py-3"
      header={
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-[14px] font-semibold text-foreground">{tool.name}</span>
          <Badge className="bg-gray-100 text-gray-700">v{tool.version}</Badge>
          <Badge className="bg-sky-50 text-sky-700">{tool.total_marks} marks</Badge>
          <span className="text-[12px] text-muted-foreground">
            {(tool.sections || []).length} sections, {qCount} questions
          </span>
        </div>
      }
    >
      <div className="border-t border-border">
        {(tool.sections || []).map(s => (
          <Disclosure
            key={s.id}
            open={isOpen('s:' + s.id)}
            onToggle={() => toggle('s:' + s.id)}
            className="border-b border-border last:border-0"
            headerClassName="bg-muted/20 px-4 py-2"
            header={
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12.5px] font-semibold text-foreground">
                  {s.code ? s.code + '. ' : ''}{s.name}
                </span>
                <span className="text-[11.5px] text-muted-foreground">
                  {(s.criteria || []).length} questions, {s.total_marks} marks
                </span>
              </div>
            }
          >
            <div className="border-t border-border">
              {(s.criteria || []).map(c => (
                <Criterion key={c.id} c={c} open={isOpen('c:' + c.id)} onToggle={() => toggle('c:' + c.id)} />
              ))}
            </div>
          </Disclosure>
        ))}
      </div>
    </Disclosure>
  );
}

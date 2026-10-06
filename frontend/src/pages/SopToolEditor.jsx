import { useParams } from 'react-router-dom';

// Placeholder: the SOP tool editor stream builds the real page.
export default function SopToolEditor() {
  const { code } = useParams();
  return (
    <div className="mx-auto max-w-3xl">
      <div className="text-[15px] font-bold text-foreground">SOP tool editor</div>
      <div className="mt-1 text-sm text-muted-foreground">Tool code: {code}</div>
    </div>
  );
}

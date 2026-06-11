import { Topbar } from "@/components/Topbar";

/** Simple "coming in a later phase" screen, used by not-yet-built routes. */
export function Placeholder({
  title,
  phase,
  children,
}: {
  title: string;
  phase: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="screen">
      <Topbar title={title} subtitle={`· ${phase}`} />
      <div className="screen-body">
        <div className="card">
          <div className="card-body placeholder-note">
            <strong>{title}</strong> is scheduled for <strong>{phase}</strong>.
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

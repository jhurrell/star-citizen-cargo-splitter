export function WarnNote({ children }: { children: React.ReactNode }) {
  return (
    <span className="warn-note">
      <span className="warn-badge" aria-hidden="true">
        !
      </span>
      {children}
    </span>
  );
}

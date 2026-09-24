/** Shown while a lazy route chunk loads, instead of a blank flash. */
export function ShellBoot() {
  return (
    <div className="grid min-h-[40vh] place-items-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <span className="boot-spinner" aria-hidden="true" />
        <span className="text-subtle text-sm">Loading…</span>
      </div>
    </div>
  );
}

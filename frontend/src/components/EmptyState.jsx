export function EmptyState({ icon: Icon, title, description, action, testid }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center flex flex-col items-center" data-testid={testid}>
      {Icon && (
        <div className="h-12 w-12 rounded-2xl bg-secondary/60 flex items-center justify-center mb-4">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      {description && <p className="text-sm text-muted-foreground mt-1 max-w-md">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

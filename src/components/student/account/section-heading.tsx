export function SectionHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header>
      <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
      <p className="text-muted-foreground mt-1 text-[13px] leading-relaxed">
        {description}
      </p>
    </header>
  );
}

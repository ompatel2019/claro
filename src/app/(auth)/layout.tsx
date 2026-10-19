import { Logo } from "@/components/logo";
import { Card } from "@/components/claro/data-display";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="bg-background flex min-h-dvh flex-1 flex-col items-center justify-center gap-6 px-4 py-10 sm:py-16">
      <Logo height={32} />
      <Card className="w-full max-w-md gap-0 p-5 sm:p-8">{children}</Card>
      <p className="text-muted-foreground text-center text-[13px]">
        HSC Economics, marked in seconds.
      </p>
    </main>
  );
}

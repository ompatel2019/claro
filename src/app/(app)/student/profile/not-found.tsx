import Link from "next/link";
import { EmptyState } from "@/components/claro/layout";
import { Card } from "@/components/claro/data-display";
import { buttonVariants } from "@/components/ui/button";
export default function NotFound() {
  return (
    <Card className="w-full max-w-[1400px] p-5">
      <EmptyState
        title="Profile not found"
        description="We couldn't find your profile."
        action={
          <Link
            href="/student"
            className={buttonVariants({ variant: "outline" })}
          >
            Back to home
          </Link>
        }
      />
    </Card>
  );
}

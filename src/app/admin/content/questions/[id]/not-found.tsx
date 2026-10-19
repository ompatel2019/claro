import Link from "next/link";
import { EmptyState } from "@/components/claro/layout";
import { buttonVariants } from "@/components/ui/button";
export default function NotFound() {
  return (
    <EmptyState
      title="Question not found"
      description="This question is unavailable."
      action={
        <Link href="/" className={buttonVariants()}>
          Back to home
        </Link>
      }
    />
  );
}

import Link from "next/link";
import { EmptyState } from "@/components/claro/layout";
import { Card } from "@/components/claro/data-display";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 items-center px-4 py-16">
      <Card className="w-full p-5">
        <EmptyState
          title="Page not found"
          description="This page doesn’t exist or has moved."
          action={
            <Link className={buttonVariants()} href="/">
              Go home
            </Link>
          }
        />
      </Card>
    </main>
  );
}

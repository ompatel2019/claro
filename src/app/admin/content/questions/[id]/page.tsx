import { pageMetadata } from "@/lib/page-metadata";
import { requireAdmin } from "@/lib/auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadQuestion, loadTopics } from "@/lib/admin-questions";
import { PortalIcon } from "@/components/icons";
import { PageHeader } from "@/components/claro/layout";
import { QuestionEditor } from "@/components/question-editor";
import { buttonVariants } from "@/components/ui/button";

export const metadata = pageMetadata("Question editor");

/** Edit an existing imported question. */
export default async function QuestionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  if (id === "new") notFound();
  const [loaded, topics] = await Promise.all([loadQuestion(id), loadTopics()]);
  if (!loaded) notFound();
  return (
    <div>
      <Link
        href="/admin/content/questions"
        className={buttonVariants({
          variant: "link",
          className: "mb-4 gap-1.5 text-sm",
        })}
      >
        <PortalIcon name="arrow-left" className="size-4" />
        Back to questions
      </Link>
      <PageHeader
        eyebrow={loaded.question.source}
        title={loaded.question.id}
        description="Edit question content, marking guidance and publishing status."
      />
      <QuestionEditor
        key={loaded.question.updated_at}
        loaded={loaded}
        topics={topics}
      />
    </div>
  );
}

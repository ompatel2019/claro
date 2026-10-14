import { pageMetadata } from "@/lib/page-metadata";
import { requireAdmin } from "@/lib/auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadQuestion, loadTopics } from "@/lib/admin-questions";
import { PageHeader } from "@/components/page-header";
import { QuestionEditor } from "@/components/question-editor";

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
    <div className="space-y-4">
      <Link href="/admin/content/questions" className="text-sm underline">
        Back to questions
      </Link>
      <PageHeader eyebrow={loaded.question.source} title={loaded.question.id} />
      <QuestionEditor
        key={loaded.question.updated_at}
        loaded={loaded}
        topics={topics}
      />
    </div>
  );
}

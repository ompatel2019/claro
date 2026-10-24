import type { NextConfig } from "next";
import { docCommitDates } from "./src/lib/ai/docs/commit-dates.mjs";

const nextConfig: NextConfig = {
  // The 1 MiB CSV limit needs room for JSON escaping (up to 6×) and Action metadata.
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
  env: { ENGINE_DOC_COMMIT_DATES: docCommitDates() },
  outputFileTracingIncludes: {
    // Marking quality reads the engine docs and eval results at runtime.
    "/admin/marking/accuracy": [
      "./src/lib/ai/docs/*.md",
      "./data/eval/results/*.json",
    ],
  },
  // Home and sprints moved under /student (§3, §7); keep old links working.
  async redirects() {
    return [
      {
        source: "/flashcards/:id/results",
        destination: "/student/flashcards/:id",
        permanent: false,
      },
      {
        source: "/flashcards/:id",
        destination: "/student/flashcards/:id",
        permanent: false,
      },
      {
        source: "/flashcards",
        destination: "/student/flashcards",
        permanent: false,
      },
      { source: "/", destination: "/student", permanent: false },
      { source: "/practice", destination: "/student/sprint", permanent: false },
      {
        source: "/practice/:id/results",
        destination: "/student/activity/:id",
        permanent: false,
      },
      // Session results live under Activity; old sprint links and emails 308 here.
      {
        source: "/student/sprint/:id/results",
        destination: "/student/activity/:id",
        permanent: true,
      },
      {
        source: "/practice/:id",
        destination: "/student/sprint/:id",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;

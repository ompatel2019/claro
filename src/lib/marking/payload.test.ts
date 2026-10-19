import { expect, it } from "vitest";
import { studentMarking } from "@/lib/feedback";
import { markingPayload } from "./payload";

it.each(["agreed", "second_pass", "in_review"])(
  "preserves serialized payloads for both callers when %s",
  (checkStatus) => {
    const marked = {
      mark: 3,
      band: "Explains an effect",
      feedback: { comments: [], flags: { uncertain: true } },
    };
    const payload = markingPayload(marked, 4, checkStatus, "marker");
    expect(JSON.stringify(payload)).toBe(
      JSON.stringify({
        ...studentMarking(marked),
        max_marks: 4,
        check_status: checkStatus,
        marked_by_model: "marker",
      }),
    );
    for (const ownAssessment of [false, true]) {
      const feedback = {
        ...studentMarking(marked).feedback,
        ...(ownAssessment && { confidence: "estimate" }),
      };
      expect(JSON.stringify({ ...payload, feedback })).toBe(
        JSON.stringify({
          ...studentMarking(marked),
          feedback,
          max_marks: 4,
          check_status: checkStatus,
          marked_by_model: "marker",
        }),
      );
    }
    expect(marked.feedback.flags).toEqual({ uncertain: true });
  },
);

import { expect, it } from "vitest";
import { docTitle, orderDocs } from "./doc-titles";

const doc = (id: string, text = "") => ({ id, text });

it("derives readable titles and keeps ids", () => {
  expect(docTitle(doc("AIRO-5-2", "# Something else"))).toBe("Airo 5.2");
  expect(docTitle(doc("AIRO-5-3"))).toBe("Airo 5.3");
  expect(docTitle(doc("AIRO-5", "# Airo 5.0"))).toBe("Airo 5.0");
  expect(docTitle(doc("ENGINE", "# Marking engine"))).toBe("Engine");
  expect(docTitle(doc("CHANGELOG", "# Engine changelog"))).toBe("Changelog");
  expect(docTitle(doc("VERB-GUIDE", "# Directive verbs\n\n## More"))).toBe(
    "Directive verbs",
  );
  expect(docTitle(doc("CHECK-AND-AGREEMENT", "No heading"))).toBe(
    "Check and agreement",
  );
});

it("orders Engine, Changelog, Airo newest first, then the rest by title", () => {
  const ids = orderDocs([
    doc("VERB-GUIDE", "# Directive verbs"),
    doc("AIRO-5", "# Airo 5.0"),
    doc("CHANGELOG"),
    doc("COMMENT-RULES", "# Comment rules"),
    doc("AIRO-5-2"),
    doc("ENGINE"),
    doc("AIRO-5-3"),
  ]).map((d) => d.id);
  expect(ids).toEqual([
    "ENGINE",
    "CHANGELOG",
    "AIRO-5-3",
    "AIRO-5-2",
    "AIRO-5",
    "COMMENT-RULES",
    "VERB-GUIDE",
  ]);
});

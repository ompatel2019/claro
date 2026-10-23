import { expect, it } from "vitest";
import { parseCardText } from "./flashcard-text-import";
import {
  CARD_IMPORT_BYTE_LIMIT,
  CARD_FRONT_LIMIT,
  CARD_BACK_LIMIT,
  CARD_IMPORT_ROW_LIMIT,
} from "./limits";

it("parses Quizlet tabs, BOM, blank lines and all newline styles literally", () => {
  expect(
    parseCardText('\uFEFFa\tb\r\n\r\nc < d\t"literal"\re\tf\n', "quizlet"),
  ).toEqual({
    cards: [
      { line: 1, front: "a", back: "b" },
      { line: 3, front: "c < d", back: '"literal"' },
      { line: 4, front: "e", back: "f" },
    ],
    errors: [],
  });
});
it.each([
  ["bad", "No tab between front and back"],
  ["\tb", "Front is empty"],
  ["a\t ", "Back is empty"],
  ["a".repeat(CARD_FRONT_LIMIT + 1) + "\tb", "Front over 200 characters"],
  ["a\t" + "b".repeat(CARD_BACK_LIMIT + 1), "Back over 1,000 characters"],
])("rejects invalid sides: %s", (text, message) => {
  expect(parseCardText(text, "quizlet")).toEqual({
    cards: [],
    errors: [{ line: 1, message }],
  });
});
it("enforces byte and row limits and rejects empty input", () => {
  expect(() =>
    parseCardText("é".repeat(CARD_IMPORT_BYTE_LIMIT / 2 + 1), "anki"),
  ).toThrow("Files must be 1 MB or smaller.");
  expect(() =>
    parseCardText("a\tb\n".repeat(CARD_IMPORT_ROW_LIMIT + 1), "quizlet"),
  ).toThrow("Import at most 500 cards.");
  expect(
    parseCardText("a\tb\n".repeat(CARD_IMPORT_ROW_LIMIT), "quizlet").cards,
  ).toHaveLength(CARD_IMPORT_ROW_LIMIT);
  expect(() => parseCardText("\n# comment", "anki")).toThrow("No cards found.");
});
it("consumes Anki headers, comments and tags and ignores extra regular fields", () => {
  expect(
    parseCardText(
      "#separator:tab\n#html:true\n#tags column:3\n# a comment\n<b>Front</b>\tBack\ttag\textra\n# comment\nNext\tAnswer",
      "anki",
    ),
  ).toEqual({
    cards: [
      { line: 5, front: "Front", back: "Back" },
      { line: 7, front: "Next", back: "Answer" },
    ],
    errors: [],
  });
});
it("skips guid, notetype and deck columns", () => {
  expect(
    parseCardText(
      "#guid column:1\n#notetype column:2\n#deck column:4\nid\ttype\tFront\tdeck\tBack\textra",
      "anki",
    ).cards,
  ).toEqual([{ line: 4, front: "Front", back: "Back" }]);
});
it.each(["comma", ";", "space"])("rejects separator %s", (separator) => {
  expect(() => parseCardText(`#separator:${separator}\na\tb`, "anki")).toThrow(
    "Export with tabs between fields.",
  );
});
it("supports a literal tab separator header", () => {
  expect(parseCardText("#separator:\t\na\tb", "anki").cards).toHaveLength(1);
});
it("cleans HTML and media without reparsing decoded entities", () => {
  expect(
    parseCardText(
      "<script>alert(1)</script><style>x</style>A<br>B\t<p>C&nbsp; &amp; &lt;b&gt; &quot; &#39; &apos; &#65; &#x42;</p><div>D</div><li>E</li>[sound:x.mp3]\n&amp;lt;b&amp;gt;\tx",
      "anki",
    ).cards,
  ).toEqual([
    { line: 1, front: "A B", back: "C & <b> \" ' ' A B\nD\nE" },
    { line: 2, front: "&lt;b&gt;", back: "x" },
  ]);
  expect(parseCardText('<img src="x">\tb', "anki").errors[0].message).toBe(
    "Front is empty",
  );
  expect(parseCardText("a\tb<br>c", "anki").cards[0].back).toBe("b\nc");
});
it("respects html:false and never strips Quizlet HTML", () => {
  expect(parseCardText("#html:false\n<b>a</b>\tb", "anki").cards[0].front).toBe(
    "<b>a</b>",
  );
  expect(parseCardText("<b>a</b>\tb", "quizlet").cards[0].front).toBe(
    "<b>a</b>",
  );
});
it("parses quoted tabs, multiline fields, escaped quotes and starting lines", () => {
  expect(
    parseCardText(
      '#html:false\n"a\tb"\t"first\r\nsecond ""quoted"""\nnext\tback\n""\tb\n"unclosed\tliteral',
      "anki",
    ),
  ).toEqual({
    cards: [
      { line: 2, front: "a\tb", back: 'first\nsecond "quoted"' },
      { line: 4, front: "next", back: "back" },
      { line: 6, front: '"unclosed', back: "literal" },
    ],
    errors: [{ line: 5, message: "Front is empty" }],
  });
});

it("reads an unclosed Anki quote literally without rescanning the paste", () => {
  const started = performance.now();
  const { errors } = parseCardText('"a\t'.repeat(200000), "anki");
  expect(errors).toEqual([]);
  expect(performance.now() - started).toBeLessThan(2000);
});

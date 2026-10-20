import { expect, it } from "vitest";
import { isAnswerImageKey } from "./answer-image-key";

const uid = "d0d38222-b9bb-4089-81d5-383878dd9d9d";
const file = "75f2a40b-3e20-4a56-9e14-1b237cfc8396-1729000000000-0";

it.each(["jpg", "png", "webp", "heic", "heif"])(
  "accepts uploaded %s photos for their owner",
  (ext) => expect(isAnswerImageKey(`${uid}/${file}.${ext}`, uid)).toBe(true),
);

it.each([
  "",
  "/",
  ".",
  "..",
  "../victim/photo.png",
  "../../reports/photo.png",
  "%2e%2e/victim/photo.png",
  "%252e%252e/photo.png",
  "./photo.png",
  "/photo.png",
  "folder/photo.png",
  "..\\victim\\photo.png",
  `${file}.png?x=1`,
  `${file}.png#fragment`,
  `${file}.png%00`,
  `${file}.png\n`,
  `${file}.png\r`,
  `${file}.png\t`,
  `${file}.png\0`,
  `${file}.png\u007f`,
  `${file}.png\u0085`,
  "photo.png",
  `${file}.svg`,
])("rejects noncanonical suffix %j", (suffix) => {
  expect(isAnswerImageKey(`${uid}/${suffix}`, uid)).toBe(false);
});

it("rejects another owner, absolute keys, extra segments and nonstrings", () => {
  for (const key of [
    null,
    1,
    {},
    `${uid}x/${file}.png`,
    `/${uid}/${file}.png`,
    `${uid}//${file}.png`,
  ])
    expect(isAnswerImageKey(key, uid)).toBe(false);
});

it.each(["jpg", "png", "webp"])(
  "preserves legacy single-photo %s keys",
  (ext) => {
    expect(
      isAnswerImageKey(
        `${uid}/75f2a40b-3e20-4a56-9e14-1b237cfc8396-1729000000000.${ext}`,
        uid,
      ),
    ).toBe(true);
  },
);

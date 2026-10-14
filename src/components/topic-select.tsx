"use client";
import type { Topic } from "@/lib/practice";
import { FormField } from "./form-field";
import { FormSelect } from "./ui/form-select";

/** Numbered course topic followed by only its subtopics. */
export function TopicSelect({
  topics,
  parent,
  value,
  onParentChange,
  onChange,
  disabled,
  error,
}: {
  topics: Topic[];
  parent: string;
  value: string;
  onParentChange: (id: string) => void;
  onChange: (id: string) => void;
  disabled?: boolean;
  error?: string;
}) {
  return (
    <>
      <FormField label="Topic">
        <FormSelect
          value={parent}
          disabled={disabled}
          onValueChange={onParentChange}
          options={[
            { value: "", label: "Choose a topic" },
            ...topics
              .filter((t) => !t.parent_id)
              .sort((a, b) => a.sort - b.sort)
              .map((t) => ({ value: t.id, label: `${t.sort}. ${t.name}` })),
          ]}
        />
      </FormField>
      <FormField label="Subtopic" error={error}>
        <FormSelect
          value={value}
          disabled={disabled || !parent}
          onValueChange={onChange}
          options={[
            {
              value: "",
              label: parent ? "Choose a subtopic" : "Choose a topic first",
            },
            ...topics
              .filter((t) => t.parent_id === parent)
              .map((t) => ({ value: t.id, label: t.name })),
          ]}
        />
      </FormField>
    </>
  );
}

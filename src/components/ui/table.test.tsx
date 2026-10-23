import { act, fireEvent } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vitest";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

it("keeps server table markup unchanged through hydration and row clicks", async () => {
  const onClick = vi.fn();
  const table = (
    <Table aria-label="Results" className="text-base">
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Mark</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow onClick={onClick} aria-selected="true">
          <TableCell data-mark="full">5 / 5</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
  const html = renderToString(table);
  expect(html).toMatchInlineSnapshot(
    `"<div data-slot="table-container" class="relative w-full overflow-x-auto"><table data-slot="table" class="w-full caption-bottom text-base" aria-label="Results"><thead data-slot="table-header"><tr data-slot="table-row" class="h-12"><th data-slot="table-head" class="text-muted-foreground h-10 px-3 text-left align-middle text-xs font-medium whitespace-nowrap first:pl-5 last:pr-5" scope="col">Mark</th></tr></thead><tbody data-slot="table-body"><tr data-slot="table-row" class="h-12" aria-selected="true"><td data-slot="table-cell" class="px-3 py-2 align-middle whitespace-nowrap first:pl-5 last:pr-5" data-mark="full">5 / 5</td></tr></tbody></table></div>"`,
  );
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.append(container);
  const onRecoverableError = vi.fn();
  let root: ReturnType<typeof hydrateRoot>;
  await act(async () => {
    root = hydrateRoot(container, table, { onRecoverableError });
  });
  try {
    expect(container.innerHTML).toBe(html);
    fireEvent.click(container.querySelector("td")!);
    expect(onClick).toHaveBeenCalledOnce();
    expect(onRecoverableError).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/admin/students/ada",
  useSearchParams: () => new URLSearchParams(),
}));
import { ServerTable } from "./static-table-server";

afterEach(cleanup);

const rows = Array.from({ length: 60 }, (_, i) => ({
  id: `r${i}`,
  cells: { name: `Row ${String(i).padStart(2, "0")}` },
  keys: { name: `Row ${String(i).padStart(2, "0")}` },
}));
const columns = [{ id: "name", header: "Name", sortable: true }];

it("reads its own prefixed sort and page so two tables on a page don't move together", () => {
  const params = { sort: "name", dir: "desc", page: "2" };
  render(
    <>
      <ServerTable
        params={params}
        label="Reviews"
        columns={columns}
        rows={rows}
      />
      <ServerTable
        params={params}
        paramPrefix="feedback_"
        label="Feedback"
        columns={columns}
        rows={rows}
      />
    </>,
  );
  const [reviews, feedback] = screen.getAllByRole("table");
  // Unprefixed table: page 2 of a descending sort.
  expect(within(reviews).getAllByRole("row")[1]).toHaveTextContent("Row 09");
  // Prefixed table ignores the other table's params: page 1, ascending.
  expect(within(feedback).getAllByRole("row")[1]).toHaveTextContent("Row 00");
});

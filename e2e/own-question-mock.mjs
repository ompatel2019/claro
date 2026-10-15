// Read-only local Supabase double. No credentials, database or model calls.
import { createServer } from "node:http";
const user = {
  id: "11111111-1111-4111-8111-111111111111",
  aud: "authenticated",
  role: "authenticated",
  email: "student@example.test",
  app_metadata: {},
  user_metadata: {},
};
createServer((request, response) => {
  const url = new URL(request.url, "http://localhost");
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Content-Range", "*/0");
  if (
    request.method !== "GET" &&
    request.method !== "HEAD" &&
    url.pathname !== "/rest/v1/rpc/sprint_questions"
  ) {
    response.writeHead(403);
    response.end(JSON.stringify({ error: "Writes forbidden" }));
    return;
  }
  let data = [];
  if (url.pathname === "/auth/v1/user") data = user;
  else if (url.pathname === "/rest/v1/profiles")
    data = {
      ...user,
      full_name: "Test student",
      year_level: 12,
      role: "student",
    };
  else if (url.pathname === "/rest/v1/topics")
    data = [
      { id: "policy", name: "Monetary policy", parent_id: "policies", sort: 1 },
    ];
  response.end(request.method === "HEAD" ? undefined : JSON.stringify(data));
}).listen(54329, "127.0.0.1");

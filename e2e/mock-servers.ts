export function mockServers(
  mock: string,
  appPort: number,
  supabasePort: number,
  env: Record<string, string> = {},
) {
  return [
    {
      cwd: process.cwd(),
      command: `node e2e/${mock}-mock.mjs`,
      url: `http://127.0.0.1:${supabasePort}/auth/v1/user`,
      reuseExistingServer: false,
    },
    {
      cwd: process.cwd(),
      command: `npm run dev -- -p ${appPort}`,
      url: `http://localhost:${appPort}`,
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_APP_URL: `http://localhost:${appPort}`,
        NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${supabasePort}`,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "dummy-publishable-key",
        ...env,
      },
    },
  ];
}

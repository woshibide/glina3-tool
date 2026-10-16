// Dev server with hot reload: `npm run start` or `npm run start -- --port <port>`.
// Rejects invalid or occupied ports instead of silently picking another.
import { createServer } from "vite";

const args = process.argv.slice(2);
let port = 5173;
for (let i = 0; i < args.length; i++) {
  const [flag, inline] = args[i].split("=");
  if (flag !== "--port") {
    console.error(`Unknown argument "${args[i]}". Usage: npm run start -- --port <port>`);
    process.exit(1);
  }
  const value = inline ?? args[++i];
  if (!/^\d+$/.test(value ?? "") || +value < 1 || +value > 65535) {
    console.error(`Invalid port "${value ?? ""}". Use a whole number from 1 to 65535.`);
    process.exit(1);
  }
  port = +value;
}

try {
  const server = await createServer({ server: { host: "127.0.0.1", port, strictPort: true } });
  await server.listen();
  server.printUrls();
} catch (error) {
  console.error(error.code === "EADDRINUSE" || /already in use/.test(error.message)
    ? `Port ${port} is already in use. Choose another with: npm run start -- --port <port>`
    : error.message);
  process.exit(1);
}

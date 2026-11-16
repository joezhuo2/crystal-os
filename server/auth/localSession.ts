import type { Connect, Plugin } from "vite";

const ROUTE = "/api/session";
const LOOPBACK = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;

export function createSessionMiddleware(token: string): Connect.NextHandleFunction {
  return (req, res, next) => {
    if ((req.url ?? "").split("?")[0] !== ROUTE) return next();

    const host = req.headers.host ?? "";
    const origin = req.headers.origin;
    const site = req.headers["sec-fetch-site"];
    const sameOrigin = (!origin || origin === `http://${host}`) && (!site || site === "same-origin");

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "GET" || !LOOPBACK.test(host) || !sameOrigin) {
      res.statusCode = 403;
      res.end(JSON.stringify({ error: "Forbidden" }));
      return;
    }
    res.end(JSON.stringify({ token }));
  };
}

export function localSessionApi(token: string): Plugin {
  const middleware = createSessionMiddleware(token);
  return {
    name: "crystal-os:local-session",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

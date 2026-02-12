import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useLocation,
} from "@remix-run/react";
import { json } from "@remix-run/node";
import type { LinksFunction, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { Navigation } from "~/components/layout/Navigation";
import globalStyles from "~/styles/global.css?url";
import { getSession, sessionStorage } from "~/session.server";
import { apiFetch } from "~/lib/api.server";
import type { AuthUser } from "~/types/auth";

export const links: LinksFunction = () => [{ href: globalStyles, rel: "stylesheet" }];

export const meta: MetaFunction = () => [
  { charset: "utf-8" },
  { name: "viewport", content: "width=device-width,initial-scale=1" },
  { name: "description", content: "iPhone 17 Pro Max - Pro, taken further." },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await getSession(request);

  const token = session.get("token");
  const maybeUser = session.get("user");
  const user = maybeUser && typeof maybeUser === "object" ? (maybeUser as AuthUser) : null;

  if (!user && token && typeof token === "string") {
    try {
      const freshUser = await apiFetch<AuthUser>(`/auth/me`, { token });
      session.set("user", freshUser);
      return json(
        { user: freshUser },
        { headers: { "Set-Cookie": await sessionStorage.commitSession(session) } },
      );
    } catch (error: any) {
      if (error?.status === 401) {
        return json(
          { user: null },
          { headers: { "Set-Cookie": await sessionStorage.destroySession(session) } },
        );
      }
    }
  }

  return json({ user });
}

export default function App() {
  const { user } = useLoaderData<typeof loader>();
  const location = useLocation();
  const isHome = location.pathname === "/";

  return (
    <html lang="en">
      <head>
        <Meta />
        <Links />
      </head>
      <body className="ambient-bg">
        <Navigation user={user} />
        <main className={isHome ? undefined : "pt-32"}>
          <Outlet />
        </main>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

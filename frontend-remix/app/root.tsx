import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from '@remix-run/react';
import type { LinksFunction, MetaFunction } from '@remix-run/node';
import { Navigation } from '~/components/layout/Navigation';
import globalStyles from '~/styles/global.css?url';

export const links: LinksFunction = () => [
    { rel: 'stylesheet', href: globalStyles },
];

export const meta: MetaFunction = () => {
  return [
    { charset: 'utf-8' },
    { name: 'viewport', content: 'width=device-width,initial-scale=1' },
    { name: 'description', content: 'iPhone 17 Pro Max - Pro, taken further.' },
  ];
};

export default function App() {
  return (
    <html lang="en">
      <head>
        <Meta />
        <Links />
      </head>
      <body className="bg-background-primary text-gray-900">
        <Navigation />
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

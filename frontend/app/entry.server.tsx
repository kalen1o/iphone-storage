import { PassThrough } from "node:stream";
import { createReadableStreamFromReadable } from "@remix-run/node";
import type { EntryContext } from "@remix-run/node";
import { RemixServer } from "@remix-run/react";
import { isbot } from "isbot";
import { renderToPipeableStream } from "react-dom/server";

const ABORT_DELAY = 5000;

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext,
) {
  return isbot(request.headers.get("user-agent"))
    ? handleBotRequest(responseStatusCode, responseHeaders)
    : handleBrowserRequest(request, responseStatusCode, responseHeaders, remixContext);
}

function handleBotRequest(responseStatusCode: number, responseHeaders: Headers) {
  return new Response(
    `<!DOCTYPE html>
    <html>
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
      </head>
      <body>
        <div id="root"></div>
      </body>
    </html>`,
    {
      headers: responseHeaders,
      status: responseStatusCode,
    },
  );
}

function handleBrowserRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext,
) {
  return new Promise((resolve, reject) => {
    let didError = false;

    const { pipe, abort } = renderToPipeableStream(
      <RemixServer context={remixContext} url={request.url} />,
      {
        onError(error: unknown) {
          didError = true;

          console.error(error);
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onShellReady() {
          const body = new PassThrough();

          responseHeaders.set("Content-Type", "text/html");

          resolve(
            new Response(createReadableStreamFromReadable(body), {
              headers: responseHeaders,
              status: didError ? 500 : responseStatusCode,
            }),
          );

          pipe(body);
        },
      },
    );

    setTimeout(abort, ABORT_DELAY);
  });
}

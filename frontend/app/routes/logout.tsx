import type { ActionFunctionArgs } from '@remix-run/node';
import { redirect } from '@remix-run/node';
import { getSession, sessionStorage } from '~/session.server';

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const redirectTo = String(form.get('redirectTo') || '/');
  const session = await getSession(request);
  return redirect(redirectTo, {
    headers: { 'Set-Cookie': await sessionStorage.destroySession(session) },
  });
}

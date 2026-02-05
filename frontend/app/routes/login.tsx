import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { Form, Link, useActionData, useSearchParams } from '@remix-run/react';
import { redirect } from '@remix-run/node';
import { apiFetch } from '~/lib/api.server';
import { getSession, sessionStorage } from '~/session.server';
import type { AuthResponse } from '~/types/auth';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';

type ActionData = { error?: string };

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await getSession(request);
  const token = session.get('token');
  if (token) return redirect('/cart');
  return null;
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const email = String(form.get('email') || '');
  const password = String(form.get('password') || '');
  const redirectTo = String(form.get('redirectTo') || '/cart');

  try {
    const res = await apiFetch<AuthResponse>(`/auth/login`, {
      method: 'POST',
      body: { email, password },
    });

    const session = await getSession(request);
    session.set('token', res.token);
    session.set('user', res.user);
    return redirect(redirectTo, {
      headers: { 'Set-Cookie': await sessionStorage.commitSession(session) },
    });
  } catch (e: any) {
    return { error: e?.message || 'Login failed' } satisfies ActionData;
  }
}

export default function Login() {
  const data = useActionData<typeof action>();
  const [params] = useSearchParams();
  const redirectTo = params.get('redirectTo') || '/cart';

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary flex items-center justify-center px-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Use your account to place an order.</CardDescription>
        </CardHeader>
        <CardContent>
          {data?.error && (
            <div className="mb-4 rounded-lg bg-destructive/15 border border-destructive/30 px-4 py-3 text-destructive-foreground text-sm">
              {data.error}
            </div>
          )}

          <Form method="post" className="space-y-4">
            <input type="hidden" name="redirectTo" value={redirectTo} />

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required placeholder="customer@example.com" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" required placeholder="••••••••" />
            </div>

            <Button type="submit" className="w-full">
              Sign in
            </Button>
          </Form>

          <div className="mt-6 text-sm text-muted-foreground">
            No account?{" "}
            <Link to={`/register?redirectTo=${encodeURIComponent(redirectTo)}`} className="text-foreground underline">
              Create one
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { Form, Link, useActionData, useSearchParams } from '@remix-run/react';
import { redirect } from '@remix-run/node';
import { apiFetch } from '~/lib/api.server';
import { getSession, sessionStorage } from '~/session.server';
import type { AuthResponse } from '~/types/auth';
import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { fadeScaleVariants, fadeUpVariants, staggerContainer } from '~/components/animation/route-motion';

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
  const firstName = String(form.get('firstName') || '');
  const lastName = String(form.get('lastName') || '');
  const redirectTo = String(form.get('redirectTo') || '/cart');

  try {
    const res = await apiFetch<AuthResponse>(`/auth/register`, {
      method: 'POST',
      body: { email, password, first_name: firstName, last_name: lastName },
    });

    const session = await getSession(request);
    session.set('token', res.token);
    session.set('user', res.user);
    return redirect(redirectTo, {
      headers: { 'Set-Cookie': await sessionStorage.commitSession(session) },
    });
  } catch (e: any) {
    return { error: e?.message || 'Registration failed' } satisfies ActionData;
  }
}

export default function Register() {
  const data = useActionData<typeof action>();
  const [params] = useSearchParams();
  const redirectTo = params.get('redirectTo') || '/cart';
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className="min-h-screen bg-gradient-to-b from-background to-secondary flex items-center justify-center px-6"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <motion.div
        initial={reduceMotion ? false : 'hidden'}
        animate="visible"
        variants={staggerContainer(0, 0.08)}
      >
      <motion.div variants={fadeScaleVariants}>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create account</CardTitle>
          <CardDescription>Register to place an order.</CardDescription>
        </CardHeader>
        <CardContent>
          {data?.error && (
            <div className="mb-4 rounded-lg bg-destructive/15 border border-destructive/30 px-4 py-3 text-destructive-foreground text-sm">
              {data.error}
            </div>
          )}

          <motion.div variants={fadeUpVariants}>
          <Form method="post" className="space-y-4">
            <input type="hidden" name="redirectTo" value={redirectTo} />

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="firstName">First name</Label>
                <Input id="firstName" name="firstName" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last name</Label>
                <Input id="lastName" name="lastName" required />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required placeholder="you@example.com" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                minLength={8}
                required
                placeholder="At least 8 characters"
              />
            </div>

            <Button type="submit" className="w-full">
              Create account
            </Button>
          </Form>
          </motion.div>

          <motion.div variants={fadeUpVariants} className="mt-6 text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to={`/login?redirectTo=${encodeURIComponent(redirectTo)}`} className="text-foreground underline">
              Sign in
            </Link>
          </motion.div>
        </CardContent>
      </Card>
      </motion.div>
      </motion.div>
    </motion.div>
  );
}

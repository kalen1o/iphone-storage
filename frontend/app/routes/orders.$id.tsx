import type { LoaderFunctionArgs } from '@remix-run/node';
import { Link, useLoaderData } from '@remix-run/react';
import { apiFetch } from '~/lib/api.server';
import { requireAuthToken } from '~/session.server';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { motion, useReducedMotion } from 'framer-motion';
import { fadeUpVariants, listItemVariants, staggerContainer } from '~/components/animation/route-motion';

type Order = {
  id: string;
  status: string;
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  created_at: string;
  items: Array<{
    id: string;
    product_id: string;
    product_name: string;
    product_sku: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  }>;
};

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { token } = await requireAuthToken(request);
  const id = params.id;
  if (!id) throw new Response('Not Found', { status: 404 });
  const order = await apiFetch<Order>(`/orders/${id}`, { token });
  return { order };
}

export default function OrderDetail() {
  const { order } = useLoaderData<typeof loader>();
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className="min-h-screen bg-gradient-to-b from-background to-secondary"
      initial={reduceMotion ? false : 'hidden'}
      animate="visible"
      variants={staggerContainer(0, 0.08)}
    >
      <div className="max-w-4xl mx-auto px-6 py-16">
        <motion.div variants={fadeUpVariants} className="flex items-center justify-between gap-4 mb-10">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Order</h1>
            <div className="text-muted-foreground text-sm mt-1">{order.id}</div>
          </div>
          <Button asChild variant="ghost">
            <Link to="/products">Continue shopping</Link>
          </Button>
        </motion.div>

        <motion.div variants={fadeUpVariants}>
        <Card className="rounded-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">Summary</CardTitle>
          </CardHeader>
          <CardContent>
          <div className="flex flex-wrap gap-6 text-foreground/80 text-sm mb-6">
            <div>
              <div className="text-muted-foreground">Status</div>
              <div className="text-foreground">{order.status}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Total</div>
              <div className="text-foreground font-semibold">${Math.round(order.total).toLocaleString()}</div>
            </div>
          </div>

          <motion.div
            className="space-y-3"
            variants={staggerContainer(0.05, 0.05)}
            initial={reduceMotion ? false : 'hidden'}
            animate="visible"
          >
            {order.items.map((it) => (
              <motion.div variants={listItemVariants} key={it.id} className="flex items-center justify-between border-t border-border/10 pt-3">
                <div>
                  <div className="text-foreground font-medium">{it.product_name}</div>
                  <div className="text-muted-foreground text-xs">{it.product_sku}</div>
                </div>
                <div className="text-foreground/80 text-sm">
                  {it.quantity} × ${Number(it.unit_price).toLocaleString()} ={' '}
                  <span className="text-foreground font-semibold">${Number(it.total_price).toLocaleString()}</span>
                </div>
              </motion.div>
            ))}
          </motion.div>

          <div className="border-t border-border/10 mt-6 pt-6 text-foreground">
            <div className="flex justify-between text-foreground/80">
              <span>Subtotal</span>
              <span>${Number(order.subtotal).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-foreground/80 mt-2">
              <span>Tax</span>
              <span>${Number(order.tax).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xl font-bold mt-4">
              <span>Total</span>
              <span>${Number(order.total).toLocaleString()}</span>
            </div>
          </div>
          </CardContent>
        </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}

import type { LoaderFunctionArgs } from '@remix-run/node';
import { Link, useLoaderData } from '@remix-run/react';
import { apiFetch } from '~/lib/api.server';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';

type Product = {
  id: string;
  name: string;
  description?: string;
  sku: string;
  price: number;
  category?: string;
  images?: string[];
};

type InventoryListResponse = {
  items: { product_id: string; in_stock: boolean }[];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get('limit') || 50);
  const offset = Number(url.searchParams.get('offset') || 0);

  const res = await apiFetch<{ items: Product[] }>(`/products?limit=${limit}&offset=${offset}`);
  const productIds = res.items.map((p) => p.id);

  let inStockByID: Record<string, boolean> = {};
  if (productIds.length) {
    try {
      const inv = await apiFetch<InventoryListResponse>(
        `/inventory?product_ids=${encodeURIComponent(productIds.join(','))}`
      );
      inStockByID = Object.fromEntries(inv.items.map((it) => [it.product_id, it.in_stock]));
    } catch {
      inStockByID = {};
    }
  }

  return { items: res.items, inStockByID };
}

export default function Products() {
  const { items, inStockByID } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary">
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="flex items-end justify-between gap-6 mb-10">
          <div>
            <h1 className="text-4xl font-bold text-foreground">Products</h1>
            <p className="text-muted-foreground mt-2">Browse products from the backend catalog.</p>
          </div>
          <Button asChild variant="ghost">
            <Link to="/cart">View cart</Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((p) => (
            <Link
              key={p.id}
              to={`/product/${p.id}`}
              className="group"
            >
              <Card className="p-6 hover:bg-card/80 transition-colors">
                <div className="text-muted-foreground text-xs mb-2">{p.sku}</div>
                <div className="mb-3">
                  {inStockByID[p.id] ? (
                    <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      In stock
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-destructive/30 bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive-foreground">
                      Out of stock
                    </span>
                  )}
                </div>
                <div className="text-xl font-semibold text-foreground mb-2">
                  {p.name}
                </div>
                {p.description && <div className="text-muted-foreground text-sm line-clamp-3">{p.description}</div>}
                <div className="mt-5 text-2xl font-bold text-primary">${Number(p.price).toLocaleString()}</div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

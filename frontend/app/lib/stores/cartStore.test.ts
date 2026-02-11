import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCartStore } from "./cartStore";

describe("useCartStore", () => {
  beforeEach(() => {
    useCartStore.setState({ items: [], isOpen: false });
    vi.restoreAllMocks();
  });

  it("adds a new item to cart", () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000001");

    useCartStore.getState().addToCart({
      productId: "p-1",
      quantity: 2,
      price: 10,
      name: "Phone",
    });

    expect(useCartStore.getState().items).toEqual([
      {
        id: "00000000-0000-4000-8000-000000000001",
        productId: "p-1",
        quantity: 2,
        price: 10,
        name: "Phone",
      },
    ]);
  });

  it("increases quantity for existing product", () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000001");

    useCartStore.getState().addToCart({
      productId: "p-1",
      quantity: 1,
      price: 10,
      name: "Phone",
    });
    useCartStore.getState().addToCart({
      productId: "p-1",
      quantity: 3,
      price: 10,
      name: "Phone",
    });

    expect(useCartStore.getState().items).toEqual([
      {
        id: "00000000-0000-4000-8000-000000000001",
        productId: "p-1",
        quantity: 4,
        price: 10,
        name: "Phone",
      },
    ]);
  });

  it("does not add item when quantity is zero or negative", () => {
    useCartStore.getState().addToCart({
      productId: "p-1",
      quantity: 0,
      price: 10,
      name: "Phone",
    });
    useCartStore.getState().addToCart({
      productId: "p-2",
      quantity: -1,
      price: 20,
      name: "Case",
    });

    expect(useCartStore.getState().items).toEqual([]);
  });

  it("removes item when quantity is updated to zero", () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000001");
    const store = useCartStore.getState();

    store.addToCart({
      productId: "p-1",
      quantity: 1,
      price: 10,
      name: "Phone",
    });
    store.updateQuantity("00000000-0000-4000-8000-000000000001", 0);

    expect(useCartStore.getState().items).toEqual([]);
  });

  it("returns total and item count", () => {
    vi.spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000001")
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000002");
    const store = useCartStore.getState();

    store.addToCart({
      productId: "p-1",
      quantity: 2,
      price: 10,
      name: "Phone",
    });
    store.addToCart({
      productId: "p-2",
      quantity: 1,
      price: 15,
      name: "Case",
    });

    expect(store.getTotal()).toBe(35);
    expect(store.getItemCount()).toBe(3);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCartStore } from "./cartStore";

describe("useCartStore", () => {
  beforeEach(() => {
    useCartStore.setState({ isOpen: false, items: [] });
    vi.restoreAllMocks();
  });

  it("adds a new item to cart", () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "00000000-0000-4000-8000-000000000001",
    );

    useCartStore.getState().addToCart({
      name: "Phone",
      price: 10,
      productId: "p-1",
      quantity: 2,
    });

    expect(useCartStore.getState().items).toStrictEqual([
      {
        id: "00000000-0000-4000-8000-000000000001",
        name: "Phone",
        price: 10,
        productId: "p-1",
        quantity: 2,
      },
    ]);
  });

  it("increases quantity for existing product", () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "00000000-0000-4000-8000-000000000001",
    );

    useCartStore.getState().addToCart({
      name: "Phone",
      price: 10,
      productId: "p-1",
      quantity: 1,
    });
    useCartStore.getState().addToCart({
      name: "Phone",
      price: 10,
      productId: "p-1",
      quantity: 3,
    });

    expect(useCartStore.getState().items).toStrictEqual([
      {
        id: "00000000-0000-4000-8000-000000000001",
        name: "Phone",
        price: 10,
        productId: "p-1",
        quantity: 4,
      },
    ]);
  });

  it("does not add item when quantity is zero or negative", () => {
    useCartStore.getState().addToCart({
      name: "Phone",
      price: 10,
      productId: "p-1",
      quantity: 0,
    });
    useCartStore.getState().addToCart({
      name: "Case",
      price: 20,
      productId: "p-2",
      quantity: -1,
    });

    expect(useCartStore.getState().items).toStrictEqual([]);
  });

  it("removes item when quantity is updated to zero", () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "00000000-0000-4000-8000-000000000001",
    );
    const store = useCartStore.getState();

    store.addToCart({
      name: "Phone",
      price: 10,
      productId: "p-1",
      quantity: 1,
    });
    store.updateQuantity("00000000-0000-4000-8000-000000000001", 0);

    expect(useCartStore.getState().items).toStrictEqual([]);
  });

  it("returns total and item count", () => {
    vi.spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000001")
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000002");
    const store = useCartStore.getState();

    store.addToCart({
      name: "Phone",
      price: 10,
      productId: "p-1",
      quantity: 2,
    });
    store.addToCart({
      name: "Case",
      price: 15,
      productId: "p-2",
      quantity: 1,
    });

    expect(store.getTotal()).toBe(35);
    expect(store.getItemCount()).toBe(3);
  });
});

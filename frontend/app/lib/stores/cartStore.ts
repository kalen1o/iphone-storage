import { create } from 'zustand';

export interface CartItem {
    id: string;
    productId: string;
    quantity: number;
    price: number;
    name: string;
    image?: string;
}

interface CartStore {
    items: CartItem[];
    isOpen: boolean;
    addToCart: (item: Omit<CartItem, 'id'>) => void;
    removeFromCart: (id: string) => void;
    updateQuantity: (id: string, quantity: number) => void;
    clearCart: () => void;
    toggleCart: () => void;
    getTotal: () => number;
    getItemCount: () => number;
}

export const useCartStore = create<CartStore>((set, get) => ({
    items: [],
    isOpen: false,

    addToCart: (item) => {
        set((state) => {
            if (item.quantity <= 0) {
                return state;
            }

            const existingItem = state.items.find(
                (i) => i.productId === item.productId
            );

            if (existingItem) {
                return {
                    items: state.items.map((i) =>
                        i.productId === item.productId
                            ? { ...i, quantity: i.quantity + item.quantity }
                            : i
                    ),
                };
            } else {
                return {
                    items: [...state.items, { ...item, id: crypto.randomUUID() }],
                };
            }
        });
    },

    removeFromCart: (id) => {
        set((state) => ({
            items: state.items.filter((item) => item.id !== id),
        }));
    },

    updateQuantity: (id, quantity) => {
        if (quantity <= 0) {
            get().removeFromCart(id);
            return;
        }

        set((state) => ({
            items: state.items.map((item) =>
                item.id === id ? { ...item, quantity } : item
            ),
        }));
    },

    clearCart: () => {
        set({ items: [] });
    },

    toggleCart: () => {
        set((state) => ({ isOpen: !state.isOpen }));
    },

    getTotal: () => {
        return get().items.reduce((total, item) => total + item.price * item.quantity, 0);
    },

    getItemCount: () => {
        return get().items.reduce((count, item) => count + item.quantity, 0);
    },
}));

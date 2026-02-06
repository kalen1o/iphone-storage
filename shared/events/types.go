package events

type OrderItem struct {
	ProductID string `json:"product_id"`
	Quantity  int    `json:"quantity"`
}

type OrdersCreatedData struct {
	OrderID   string     `json:"order_id"`
	UserID    string     `json:"user_id"`
	Items     []OrderItem `json:"items"`
	Subtotal  float64    `json:"subtotal"`
	Tax       float64    `json:"tax"`
	Total     float64    `json:"total"`
	Currency  string     `json:"currency"`
}

type InventoryReservedData struct {
	OrderID string `json:"order_id"`
}

type InventoryOutOfStockData struct {
	OrderID string `json:"order_id"`
	Reason  string `json:"reason,omitempty"`
}

type InventoryReleasedData struct {
	OrderID string `json:"order_id"`
	Reason  string `json:"reason,omitempty"`
}

type PaymentsSucceededData struct {
	OrderID   string `json:"order_id"`
	PaymentID string `json:"payment_id"`
}

type PaymentsFailedData struct {
	OrderID   string `json:"order_id"`
	PaymentID string `json:"payment_id"`
	Reason    string `json:"reason,omitempty"`
}

type OrdersPaidData struct {
	OrderID string `json:"order_id"`
}

type OrdersCancelledData struct {
	OrderID string `json:"order_id"`
	Reason  string `json:"reason,omitempty"`
}


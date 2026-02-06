package events

type Type string

const (
	TypeOrdersCreated    Type = "orders.created"
	TypeOrdersPaid       Type = "orders.paid"
	TypeOrdersCancelled  Type = "orders.cancelled"

	TypeInventoryReserved   Type = "inventory.reserved"
	TypeInventoryReleased   Type = "inventory.released"
	TypeInventoryOutOfStock Type = "inventory.out_of_stock"

	TypePaymentsSucceeded Type = "payments.succeeded"
	TypePaymentsFailed    Type = "payments.failed"
)


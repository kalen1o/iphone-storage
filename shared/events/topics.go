package events

const (
	TopicOrdersCreated         = "orders.created"
	TopicOrdersPaid            = "orders.paid"
	TopicOrdersCancelled       = "orders.cancelled"
	TopicOrdersPaymentRequired = "orders.payment_required"

	TopicPaymentsSucceeded = "payments.succeeded"
	TopicPaymentsFailed    = "payments.failed"

	TopicInventoryReserved   = "inventory.reserved"
	TopicInventoryReleased   = "inventory.released"
	TopicInventoryOutOfStock = "inventory.out_of_stock"
)


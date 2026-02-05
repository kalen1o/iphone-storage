package repo

// TODO: add DB/Kafka persistence for orders.
type Repository struct{}

func New() *Repository { return &Repository{} }

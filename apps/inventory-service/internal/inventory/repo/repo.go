package repo

// TODO: add DB/Kafka persistence for inventory.
type Repository struct{}

func New() *Repository { return &Repository{} }

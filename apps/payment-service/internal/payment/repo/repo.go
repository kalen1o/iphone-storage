package repo

// TODO: add DB/Kafka persistence for payments.
type Repository struct{}

func New() *Repository { return &Repository{} }

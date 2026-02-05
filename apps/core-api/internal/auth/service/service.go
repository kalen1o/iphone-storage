package service

import (
	"context"
	"errors"
	"strings"

	"golang.org/x/crypto/bcrypt"

	"github.com/kalen1o/iphone-storage/apps/core-api/internal/auth/repo"
)

type Service struct {
	repo repo.Repository
	jwt  *JWT
}

func New(r repo.Repository, jwt *JWT) *Service {
	return &Service{repo: r, jwt: jwt}
}

type RegisterInput struct {
	Email     string
	Password  string
	FirstName string
	LastName  string
}

type LoginInput struct {
	Email    string
	Password string
}

func (s *Service) Register(ctx context.Context, in RegisterInput) (string, *repo.User, error) {
	email := strings.TrimSpace(strings.ToLower(in.Email))
	if email == "" || len(in.Password) < 8 {
		return "", nil, errors.New("invalid email or password")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		return "", nil, err
	}

	u, err := s.repo.CreateUser(ctx, repo.CreateUserInput{
		Email:        email,
		PasswordHash: string(hash),
		FirstName:    strings.TrimSpace(in.FirstName),
		LastName:     strings.TrimSpace(in.LastName),
		Role:         "customer",
	})
	if err != nil {
		return "", nil, err
	}

	token, err := s.jwt.GenerateToken(u.ID.String(), u.Email, u.Role)
	if err != nil {
		return "", nil, err
	}
	return token, u, nil
}

func (s *Service) Login(ctx context.Context, in LoginInput) (string, *repo.User, error) {
	email := strings.TrimSpace(strings.ToLower(in.Email))
	if email == "" || in.Password == "" {
		return "", nil, errors.New("invalid credentials")
	}

	u, err := s.repo.GetUserByEmail(ctx, email)
	if err != nil {
		return "", nil, err
	}

	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(in.Password)); err != nil {
		return "", nil, errors.New("invalid credentials")
	}

	token, err := s.jwt.GenerateToken(u.ID.String(), u.Email, u.Role)
	if err != nil {
		return "", nil, err
	}
	return token, u, nil
}

func (s *Service) JWT() *JWT { return s.jwt }

func (s *Service) GetUserByEmail(ctx context.Context, email string) (*repo.User, error) {
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" {
		return nil, errors.New("invalid email")
	}
	return s.repo.GetUserByEmail(ctx, email)
}

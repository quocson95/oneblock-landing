build:
	docker compose up -d --build
nocache:
	docker compose build --no-cache && docker compose up -d
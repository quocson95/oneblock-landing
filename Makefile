build:
	docker compose up -d --build
nocache:
	node  sync-mdx.cjs && docker compose up -d --build
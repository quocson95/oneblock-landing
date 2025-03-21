FROM node:22.12-alpine3.20 AS builder

ARG BUILDMODE=prod
ENV BUILDMODE=$BUILDMODE

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g corepack@latest && corepack enable

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install

# Copy the source code
COPY . .
# Buid
# RUN npx tinacms build 
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm build
# Run postbuild only if BUILDMODE is "prod"
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    if [ "$BUILDMODE" = "prod" ]; then pnpm postbuild; else echo "Skipping postbuild"; fi


# Use the Nginx image to serve the Angular app
FROM nginx:1.27.3-alpine

COPY nginx.conf /etc/nginx/nginx.conf
# Copy the built Angular app from the previous stage
COPY --from=builder /app/dist /usr/share/nginx/html
RUN mkdir -p /usr/share/nginx/html/static/uploads

# Expose port 80
EXPOSE 80

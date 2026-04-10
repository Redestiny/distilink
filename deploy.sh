#!/bin/bash
# Deploy script for Distilink with Let's Encrypt HTTPS
set -euo pipefail

COMMAND=${1:-""}
DOMAIN=${2:-""}
EMAIL=${3:-"admin@${DOMAIN:-example.com}"}
CERTBOT_STAGING=${CERTBOT_STAGING:-0}

GENERATED_NGINX_DIR="deploy/generated/nginx"
HTTP_TEMPLATE="deploy/nginx/http.conf.template"
HTTPS_TEMPLATE="deploy/nginx/https.conf.template"
COMPOSE_CMD=()

compose() {
    "${COMPOSE_CMD[@]}" "$@"
}

detect_compose() {
    if ! command -v docker >/dev/null 2>&1; then
        echo "Error: docker not found"
        exit 1
    fi

    if docker compose version >/dev/null 2>&1; then
        COMPOSE_CMD=(docker compose)
    elif command -v docker-compose >/dev/null 2>&1; then
        COMPOSE_CMD=(docker-compose)
    else
        echo "Error: docker compose or docker-compose not found"
        exit 1
    fi
}

ensure_prerequisites() {
    detect_compose

    if [ ! -f .env ]; then
        echo "Error: .env not found"
        exit 1
    fi

    mkdir -p "$GENERATED_NGINX_DIR"
}

render_nginx_config() {
    local template_path=$1
    local output_path=$2

    sed "s#__DOMAIN__#$DOMAIN#g" "$template_path" > "$output_path"
}

wait_for_http() {
    local attempts=30

    while [ "$attempts" -gt 0 ]; do
        if curl -fsS http://127.0.0.1/health >/dev/null 2>&1; then
            return 0
        fi

        attempts=$((attempts - 1))
        sleep 2
    done

    echo "Error: nginx did not become ready on http://127.0.0.1/health"
    exit 1
}

reload_nginx() {
    compose exec -T nginx nginx -t
    compose exec -T nginx nginx -s reload
}

show_help() {
    cat << EOF
Usage:
    ./deploy.sh init <domain> [email]    Initialize HTTPS (first time)
    ./deploy.sh renew                     Renew certificates manually

Example:
    ./deploy.sh init your-domain.com admin@example.com
    ./deploy.sh renew

Optional:
    CERTBOT_STAGING=1 ./deploy.sh init your-domain.com admin@example.com
    CERTBOT_STAGING=1 ./deploy.sh renew    # runs certbot dry-run
EOF
}

case "$COMMAND" in
    init)
        if [ -z "$DOMAIN" ]; then
            echo "Error: domain required"
            show_help
            exit 1
        fi

        ensure_prerequisites

        render_nginx_config "$HTTP_TEMPLATE" "$GENERATED_NGINX_DIR/default.conf"

        CERTBOT_FLAGS=()
        if [ "$CERTBOT_STAGING" = "1" ]; then
            CERTBOT_FLAGS+=(--staging)
        fi

        echo "=== Building and starting app + HTTP nginx ==="
        compose up -d --build app nginx

        echo "=== Waiting for HTTP challenge endpoint ==="
        wait_for_http

        echo "=== Obtaining SSL certificate ==="
        compose run --rm --no-deps certbot certonly \
            --non-interactive \
            --webroot \
            --webroot-path /var/www/certbot \
            --cert-name "$DOMAIN" \
            --email "$EMAIL" \
            --agree-tos \
            --no-eff-email \
            --keep-until-expiring \
            "${CERTBOT_FLAGS[@]}" \
            -d "$DOMAIN"

        echo "=== Switching nginx to HTTPS ==="
        render_nginx_config "$HTTPS_TEMPLATE" "$GENERATED_NGINX_DIR/default.conf"
        reload_nginx

        echo ""
        echo "=== Done ==="
        echo "https://$DOMAIN"
        echo ""
        echo "Use a host cron job such as:"
        echo "0 3 * * * cd $PWD && ./deploy.sh renew"
        ;;

    renew)
        ensure_prerequisites

        RENEW_FLAGS=()
        if [ "$CERTBOT_STAGING" = "1" ]; then
            RENEW_FLAGS+=(--dry-run)
        fi

        echo "=== Renewing certificates ==="
        compose run --rm --no-deps certbot renew \
            --non-interactive \
            "${RENEW_FLAGS[@]}"

        echo "=== Reloading nginx ==="
        reload_nginx
        echo "Certificate check finished at $(date)"
        ;;

    *)
        show_help
        ;;
esac

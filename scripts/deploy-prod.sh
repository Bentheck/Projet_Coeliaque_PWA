#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/var/www/servicescoeliaque}"
REPO_DIR="${REPO_DIR:-$APP_ROOT/repo}"
API_PROJECT="${API_PROJECT:-$REPO_DIR/Projet_Coeliaque_PWA.Server/Projet_Coeliaque_PWA.Server.csproj}"
CLIENT_DIR="${CLIENT_DIR:-$REPO_DIR/projet_coeliaque_pwa.client}"
API_DIR="${API_DIR:-$APP_ROOT/api}"
WEB_DIR="${WEB_DIR:-$APP_ROOT/web}"
SHARED_DIR="${SHARED_DIR:-$APP_ROOT/shared}"
SHARED_CONFIG="${SHARED_CONFIG:-$SHARED_DIR/appsettings.json}"
BACKUP_DIR="${BACKUP_DIR:-$APP_ROOT/backups/deploy}"
REMOTE_NAME="${REMOTE_NAME:-origin}"
BRANCH_NAME="${BRANCH_NAME:-master}"
SKIP_GIT_SYNC="${SKIP_GIT_SYNC:-0}"
SYSTEMD_SERVICE="${SYSTEMD_SERVICE:-servicescoeliaque-api}"
NGINX_SERVICE="${NGINX_SERVICE:-nginx}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
PUBLISH_DIR="$APP_ROOT/api-publish-$TIMESTAMP"

require_safe_dir() {
  local target_path="$1"

  if [ -z "$target_path" ] || [ "$target_path" = "/" ]; then
    echo "Refusing to operate on unsafe path: '$target_path'" >&2
    exit 1
  fi

  case "$target_path" in
    "$APP_ROOT"/*) ;;
    *)
      echo "Refusing to operate outside $APP_ROOT: $target_path" >&2
      exit 1
      ;;
  esac
}

backup_file() {
  local source_path="$1"
  local bucket="$2"

  if [ -f "$source_path" ]; then
    sudo mkdir -p "$bucket"
    sudo cp "$source_path" "$bucket/$(basename "$source_path").$TIMESTAMP.bak"
  fi
}

echo "== Prepare shared config =="
sudo mkdir -p "$SHARED_DIR" "$BACKUP_DIR/api-config" "$BACKUP_DIR/repo-config"
backup_file "$API_DIR/appsettings.json" "$BACKUP_DIR/api-config"
backup_file "$REPO_DIR/Projet_Coeliaque_PWA.Server/appsettings.json" "$BACKUP_DIR/repo-config"
backup_file "$SHARED_CONFIG" "$BACKUP_DIR/api-config"

if [ ! -f "$SHARED_CONFIG" ]; then
  if [ -f "$API_DIR/appsettings.json" ]; then
    sudo cp "$API_DIR/appsettings.json" "$SHARED_CONFIG"
  elif [ -f "$REPO_DIR/Projet_Coeliaque_PWA.Server/appsettings.json" ]; then
    sudo cp "$REPO_DIR/Projet_Coeliaque_PWA.Server/appsettings.json" "$SHARED_CONFIG"
  else
    echo "No appsettings.json found to seed $SHARED_CONFIG" >&2
    exit 1
  fi
fi

sudo chown root:root "$SHARED_CONFIG"
sudo chmod 640 "$SHARED_CONFIG"

echo
echo "== Sync repo =="
cd "$REPO_DIR"
if [ "$SKIP_GIT_SYNC" = "1" ]; then
  echo "Skipping git fetch/pull because SKIP_GIT_SYNC=1"
else
  git fetch "$REMOTE_NAME"
  git checkout "$BRANCH_NAME"
  git pull --ff-only "$REMOTE_NAME" "$BRANCH_NAME"
fi
git rev-parse --short HEAD

echo
echo "== Publish API to temp dir =="
require_safe_dir "$PUBLISH_DIR"
rm -rf "$PUBLISH_DIR"
dotnet publish "$API_PROJECT" -c Release -o "$PUBLISH_DIR"

echo
echo "== Replace API payload =="
require_safe_dir "$API_DIR"
sudo systemctl stop "$SYSTEMD_SERVICE"
sudo rm -rf "$API_DIR"
sudo mkdir -p "$API_DIR"
sudo cp -a "$PUBLISH_DIR"/. "$API_DIR"/
sudo cp "$SHARED_CONFIG" "$API_DIR/appsettings.json"
sudo chown root:root "$API_DIR/appsettings.json"
sudo chmod 640 "$API_DIR/appsettings.json"
sudo systemctl start "$SYSTEMD_SERVICE"
sudo systemctl status "$SYSTEMD_SERVICE" --no-pager -l

echo
echo "== Build and publish client =="
cd "$CLIENT_DIR"
npm ci
npm run build
require_safe_dir "$WEB_DIR"
sudo rm -rf "$WEB_DIR"
sudo mkdir -p "$WEB_DIR"
sudo cp -a dist/. "$WEB_DIR"/
sudo systemctl reload "$NGINX_SERVICE"
ls -la "$WEB_DIR/assets" | head

echo
echo "== Done =="
echo "Shared config: $SHARED_CONFIG"
echo "Backups: $BACKUP_DIR"

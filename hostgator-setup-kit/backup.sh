#!/usr/bin/env bash
# Backup: dump do banco (Supabase) + snapshot das sessões do WhatsApp.
# Supabase free NÃO tem backup automático — rode isto num cron diário.
#
#   crontab -e →  0 3 * * *  cd /caminho/deskcommcrm && bash hostgator-setup-kit/backup.sh
source "$(dirname "$0")/_common.sh"
enter_project

BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
mkdir -p "$BACKUP_DIR"
# Timestamp vem do host (não do script) pra manter determinismo do kit.
ts="$(date +%Y%m%d-%H%M%S)"
db_final="$BACKUP_DIR/db-$ts.sql.gz"
db_tmp="$BACKUP_DIR/.db-$ts.sql.gz.tmp"
waha_final="$BACKUP_DIR/waha-$ts.tgz"
waha_tmp="$BACKUP_DIR/.waha-$ts.tgz.tmp"
trap 'rm -f "${db_tmp:-}" "${waha_tmp:-}"' EXIT

step "Dump do banco → $db_final"
# Pela conexão de SCHEMA (url_do_schema), não pela do app: `pg_dump` só despeja
# o que a role enxerga, e com uma role menor — a que recomendamos no `.env` de
# quem usa Supabase próprio — o backup sai PARCIAL e sai verde. Falha silenciosa
# de backup é a pior das falhas: só aparece na hora de restaurar.
if docker run --rm postgres:17-alpine pg_dump "$(url_do_schema)" --no-owner --no-privileges \
  | gzip > "$db_tmp"; then
  mv "$db_tmp" "$db_final"
else
  rm -f "$db_tmp"
  die "O dump do banco falhou. Nenhum arquivo parcial foi mantido."
fi
c_grn "✓ banco: $(du -h "$db_final" | awk '{print $1}')"

step "Snapshot das sessões do WhatsApp → $waha_final"
vol="$(dc config --volumes 2>/dev/null | grep -m1 waha-data || echo '')"
proj="$(basename "$PROJECT_DIR" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9')"
docker run --rm -v "${proj}_waha-data:/data:ro" -v "$BACKUP_DIR:/out" alpine:3.20 \
  tar czf "/out/$(basename "$waha_tmp")" -C /data . 2>/dev/null \
  && { mv "$waha_tmp" "$waha_final"; c_grn "✓ sessões WhatsApp salvas"; } \
  || { rm -f "$waha_tmp"; c_ylw "⚠ não achei o volume waha-data (nome pode variar). Ajuste manualmente se necessário."; }

# Retenção: mantém os 14 mais recentes de cada tipo.
step "Limpando backups antigos (mantém 14)"
ls -1t "$BACKUP_DIR"/db-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
ls -1t "$BACKUP_DIR"/waha-*.tgz 2>/dev/null | tail -n +15 | xargs -r rm -f
c_grn "✓ backup concluído em $BACKUP_DIR"

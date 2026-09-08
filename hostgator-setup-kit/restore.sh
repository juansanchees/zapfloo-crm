#!/usr/bin/env bash
# Restaura o banco a partir de um dump gerado pelo backup.sh.
# CUIDADO: aplica o dump ao banco configurado. Prefira um projeto vazio e valide
# antes de trocar a aplicação; em banco já populado, objetos duplicados abortam.
#
#   bash hostgator-setup-kit/restore.sh backups/db-20260702-030000.sql.gz
source "$(dirname "$0")/_common.sh"
enter_project

DUMP="${1:-}"
[ -n "$DUMP" ] && [ -f "$DUMP" ] || die "Uso: restore.sh <arquivo-db-*.sql.gz>"

c_ylw "⚠ Isto vai APLICAR o dump ao banco em $NEXT_PUBLIC_SUPABASE_URL."
c_ylw "  Use de preferência um projeto vazio; qualquer erro SQL interrompe a restauração."
read -r -p "Digite 'RESTAURAR' para confirmar: " a
[ "$a" = "RESTAURAR" ] || die "Cancelado."

step "Restaurando $DUMP"
gunzip -c "$DUMP" | docker run --rm -i postgres:17-alpine psql "$(url_do_schema)" -v ON_ERROR_STOP=1 \
  && c_grn "✓ banco restaurado" || die "Falha na restauração — veja o log acima."

c_ylw "Reinicie o app: docker compose $(dc_files) restart app"

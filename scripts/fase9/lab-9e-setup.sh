#!/usr/bin/env bash
# ============================================================================
# FASE 9 · 9E — preparar o LABORATÓRIO e rodar o gate de escala
# ============================================================================
#
#   bash scripts/fase9/lab-9e-setup.sh
#
# Sobe o Supabase local (se preciso), aplica o SQL da Fase 9 na ORDEM que as
# dependências exigem, e roda testes + benchmark da 9E.
#
# NADA AQUI TOCA PRODUÇÃO. O alvo é sempre o Postgres do container local.
# ============================================================================
set -euo pipefail

DB="supabase_db_nr13-app"
PSQL="docker exec -i $DB psql -U postgres -d postgres -X -v ON_ERROR_STOP=1"

echo "=== 1 · Supabase local ==="
if ! docker ps --format '{{.Names}}' | grep -q "^${DB}$"; then
  echo "container $DB não está de pé; subindo…"
  npx supabase start
else
  echo "container $DB já rodando"
fi

echo
echo "=== 2 · SQL da Fase 9, na ordem das dependências ==="
# A ordem importa e não é arbitrária:
#   busca_index      cria `relatorios_index`, que tudo o mais referencia;
#   busca_consulta   traz `f9_normalizar`/`f9_tsquery`, usados pela coluna
#                    gerada `busca` da 9E — sem elas o ALTER TABLE falha;
#   vencimentos_agr. acrescenta `execucao_inspecao`, que a RPC da 9E devolve;
#   busca_relatorios é a 9E propriamente dita.
for arquivo in \
  supabase/busca_index.sql \
  supabase/busca_index_indices.sql \
  supabase/busca_consulta.sql \
  supabase/busca_manutencao.sql \
  supabase/vencimentos_agregado.sql \
  supabase/busca_relatorios.sql
do
  if [ -f "$arquivo" ]; then
    printf '  %-42s ' "$arquivo"
    if $PSQL -q -f - < "$arquivo" > /tmp/9e-apply.log 2>&1; then
      echo "OK"
    else
      echo "FALHOU"
      tail -20 /tmp/9e-apply.log
      exit 1
    fi
  else
    echo "  (ausente, pulado) $arquivo"
  fi
done

echo
echo "=== 3 · Testes que exigem o servidor ==="
$PSQL -f - < scripts/fase9/testes-9e.sql

echo
echo "=== 4 · Benchmark de escala (1k → 50k, só metadados) ==="
$PSQL -f - < scripts/fase9/bench-9e.sql

echo
echo "=== FIM ==="

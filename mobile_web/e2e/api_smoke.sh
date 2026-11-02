#!/usr/bin/env bash
# Smoke-tests the mobile-facing API additions against a running server with
# demo data (bin/rails demo_data:default). Usage: mobile_web/e2e/api_smoke.sh [base_url]
set -euo pipefail
BASE="${1:-http://localhost:3000}/api/v1"
EMAIL="${SURE_EMAIL:-user@example.com}"
PASSWORD="${SURE_PASSWORD:-Password1!}"
fail=0

token=$(curl -sf -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"device\":{\"device_id\":\"api-smoke\",\"device_name\":\"smoke\",\"device_type\":\"web\",\"os_version\":\"cli\",\"app_version\":\"smoke\"}}" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
auth=(-H "Authorization: Bearer $token" -H 'Content-Type: application/json')

check() { # name, expected status, jq-ish python expression on body, curl args...
  local name=$1 want=$2 expr=$3; shift 3
  local out status body
  out=$(curl -s -w '\n%{http_code}' "${auth[@]}" "$@")
  status=${out##*$'\n'}; body=${out%$'\n'*}
  if [[ "$status" != "$want" ]]; then echo "FAIL $name: HTTP $status"; echo "$body" | head -c 300; echo; fail=1; return; fi
  if [[ -n "$expr" ]]; then
    result=$(python3 -c "import sys,json;d=json.loads(sys.argv[1]);print($expr)" "$body" 2>&1) || { echo "FAIL $name: $result"; fail=1; return; }
    echo "ok   $name → $result"
  else echo "ok   $name"; fi
}

pick() { curl -s "${auth[@]}" "$BASE/$1" | python3 -c "import sys,json;print($2)"; }

check "unreviewed + uncategorized filter" 200 '"%d unreviewed uncategorized" % d["pagination"]["total_count"]' "$BASE/transactions?reviewed=false&uncategorized=true&exclude_transfers=true&per_page=5"
check "exclude_transfers hides transfers" 200 '"transfers left: %d" % sum(1 for t in d["transactions"] if t["transfer"])' "$BASE/transactions?exclude_transfers=true&per_page=100"
tid=$(pick "transactions?reviewed=false&exclude_transfers=true&per_page=1" 'json.load(sys.stdin)["transactions"][0]["id"]')
check "category suggestions" 200 '", ".join("%s %.2f %s" % (s["name"], s["confidence"], s["source"]) for s in d["suggestions"])' "$BASE/transactions/$tid/category_suggestions"
check "PATCH reviewed" 200 'd["reviewed_at"] is not None' -X PATCH "$BASE/transactions/$tid" -d '{"transaction":{"reviewed":true}}'
check "PATCH excluded" 200 'd["excluded"]' -X PATCH "$BASE/transactions/$tid" -d '{"transaction":{"excluded":true}}'
check "PATCH un-excluded" 200 'not d["excluded"]' -X PATCH "$BASE/transactions/$tid" -d '{"transaction":{"excluded":false}}'
check "bulk review" 200 '"reviewed %d" % d["reviewed_count"]' -X POST "$BASE/transactions/review" -d "{\"ids\":[\"$tid\"]}"

bid=$(pick "budgets?per_page=1" 'json.load(sys.stdin)["budgets"][0]["id"]')
check "budget pace" 200 '"%d points, last actual %d / ideal %d" % (len(d["points"]), d["points"][-1]["actual_cumulative_cents"], d["points"][-1]["ideal_cumulative_cents"]) if d["points"] else "no points (future period)"' "$BASE/budgets/$bid/pace"
spend=$(pick "budgets/$bid" 'json.load(sys.stdin)["budgeted_spending_cents"] or 0')
check "PATCH budget" 200 'd["budgeted_spending_cents"]' -X PATCH "$BASE/budgets/$bid" -d "{\"budget\":{\"budgeted_spending\":$(( spend / 100 ))}}"
bcid=$(pick "budget_categories?budget_id=$bid&per_page=1" 'json.load(sys.stdin)["budget_categories"][0]["id"]')
bcspend=$(pick "budget_categories/$bcid" 'json.load(sys.stdin)["budgeted_spending_cents"]')
check "PATCH budget category" 200 'd["budgeted_spending_cents"]' -X PATCH "$BASE/budget_categories/$bcid" -d "{\"budget_category\":{\"budgeted_spending\":$(( bcspend / 100 ))}}"

check "net worth series" 200 '"%d points, latest %s" % (len(d["points"]), d["points"][-1]["net_worth"])' "$BASE/balance_sheet/series?period=last_90_days"
check "cash flow series" 200 '" | ".join("%s in %s out %s" % (m["month"], m["income"], m["spending"]) for m in d["months"])' "$BASE/cash_flow/series?months=3"
cid=$(pick "categories?per_page=1" 'json.load(sys.stdin)["categories"][0]["id"]')
check "rule from transaction" 201 '"rule %s" % d["data"]["id"]' -X POST "$BASE/rules/from_transaction" -d "{\"transaction_id\":\"$tid\",\"category_id\":\"$cid\"}"
rid=$(pick "rules?per_page=100" 'json.load(sys.stdin)["data"][-1]["id"]')
check "delete that rule" 200 '' -X DELETE "$BASE/rules/$rid"
aid=$(pick "accounts?per_page=1" 'json.load(sys.stdin)["accounts"][0]["id"]')
check "account sync" 202 'd["status"]' -X POST "$BASE/accounts/$aid/sync"
check "VAPID public key" 200 'len(d["public_key"]) > 40' "$BASE/push_subscriptions/vapid_public_key"
check "merchants expose logo_url" 200 '"%d merchants, all with logo_url: %s" % (len(d), all("logo_url" in m for m in d))' "$BASE/merchants"

exit $fail

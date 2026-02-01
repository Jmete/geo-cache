#!/usr/bin/env bash
set -euo pipefail

prd_path="plans/prd.json"

if [[ ! -f "$prd_path" ]]; then
  echo "Missing $prd_path" >&2
  exit 1
fi

node -e "
const fs = require('fs');
const prd = JSON.parse(fs.readFileSync('$prd_path', 'utf8'));
const items = Array.isArray(prd.items) ? prd.items : [];
const total = items.length;
const completed = items.filter((item) => item.passes === true).length;
const open = items.filter((item) => item.passes === false).length;
console.log('PRD summary');
console.log('Total items: ' + total);
console.log('Completed: ' + completed);
console.log('Open: ' + open);
"

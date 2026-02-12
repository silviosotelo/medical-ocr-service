#!/bin/bash

cat > /tmp/cc-agent/63435956/project/login-data.json << 'EOF'
{
  "email": "admin@demo.com",
  "password": "Admin123!"
}
EOF

echo "Testing login..."
curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/cc-agent/63435956/project/login-data.json | jq .

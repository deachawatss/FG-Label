#!/bin/bash

API_URL="http://localhost:${API_PORT}"
TOKEN=""

# Test login
echo "Testing login..."
LOGIN_RESPONSE=$(curl -s -X POST "${API_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"test@newlywedsfoods.co.th","password":"password"}')

if [[ $LOGIN_RESPONSE == *"token"* ]]; then
    TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.token')
    echo "Login successful"
else
    echo "Login failed"
    exit 1
fi

# Test /api/me with token
echo "Testing /api/me..."
ME_RESPONSE=$(curl -s -X GET "${API_URL}/api/me" \
  -H "Authorization: Bearer ${TOKEN}")

if [[ $ME_RESPONSE == *"username"* ]]; then
    echo "ME endpoint successful"
else
    echo "ME endpoint failed"
    exit 1
fi

# Test template creation
echo "Testing template creation..."
TEMPLATE_RESPONSE=$(curl -s -X POST "${API_URL}/api/templates" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Template",
    "description": "Test template creation",
    "engine": "html",
    "paperSize": "A6",
    "orientation": "Portrait",
    "content": "<div>Test</div>",
    "version": 1,
    "active": true
  }')

if [[ $TEMPLATE_RESPONSE == *"TemplateID"* ]]; then
    TEMPLATE_ID=$(echo $TEMPLATE_RESPONSE | jq -r '.TemplateID')
    echo "Template creation successful"
else
    echo "Template creation failed"
    exit 1
fi

# Test print job creation
echo "Testing print job creation..."
JOB_RESPONSE=$(curl -s -X POST "${API_URL}/api/jobs" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"batchNo\": \"TEST001\",
    \"templateId\": ${TEMPLATE_ID},
    \"copies\": 1
  }")

if [[ $JOB_RESPONSE == *"jobId"* ]]; then
    echo "Print job creation successful"
else
    echo "Print job creation failed"
    exit 1
fi

echo "All tests completed successfully" 
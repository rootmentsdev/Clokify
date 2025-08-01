# Environment Setup Guide

This project combines Clockify WhatsApp alerts with WhatsApp to Google Sheets functionality. Create a `.env` file in the `backend` directory with the following variables:

## Required Environment Variables

### Server Configuration
```
PORT=5000
```

### Clockify Configuration
```
CLOCKIFY_API_KEY=your_clockify_api_key_here
CLOCKIFY_WORKSPACE_ID=your_clockify_workspace_id_here
```

### WhatsApp Meta Configuration (for both Clockify alerts and Google Sheets)
```
WHATSAPP_META_TOKEN=your_whatsapp_meta_token_here
WHATSAPP_META_PHONE_NUMBER_ID=your_whatsapp_phone_number_id_here
META_VERIFY_TOKEN=whatsapp-test
```

### Google Sheets Configuration
```
SHEET_ID=1-3cHJBzR6o131fkn3KFF7SOgw7UzSFU_vvazgCxXr50
GOOGLE_CREDENTIALS_JSON={"type":"service_account","project_id":"your_project_id","private_key_id":"your_private_key_id","private_key":"-----BEGIN PRIVATE KEY-----\nyour_private_key_here\n-----END PRIVATE KEY-----\n","client_email":"your_service_account_email@your_project.iam.gserviceaccount.com","client_id":"your_client_id","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"https://www.googleapis.com/robot/v1/metadata/x509/your_service_account_email%40your_project.iam.gserviceaccount.com"}
```

### WhatsApp to Google Sheets specific variables
```
OWNER_NUMBER=918590292642
```

## How to Get These Values

### Clockify API Key
1. Go to https://clockify.me/user/settings
2. Scroll down to "API" section
3. Generate a new API key

### Clockify Workspace ID
1. Go to your Clockify workspace
2. The workspace ID is in the URL: `https://clockify.me/workspace/{WORKSPACE_ID}/...`

### WhatsApp Meta Token & Phone Number ID
1. Go to Meta for Developers: https://developers.facebook.com/
2. Create a WhatsApp Business API app
3. Get the access token and phone number ID from your app settings

### Google Sheets Service Account
1. Go to Google Cloud Console
2. Create a new project or select existing one
3. Enable Google Sheets API
4. Create a service account
5. Download the JSON credentials file
6. Share your Google Sheet with the service account email

### Google Sheet ID
1. Open your Google Sheet
2. The sheet ID is in the URL: `https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit`

## Important Notes

- The WhatsApp functionality uses the same `WHATSAPP_META_TOKEN` and `WHATSAPP_META_PHONE_NUMBER_ID` variables for both Clockify alerts and Google Sheets events
- Make sure your Google Sheet has columns A, B, C for Title, Start Date, and End Date
- The `OWNER_NUMBER` should be your WhatsApp number in international format
- The `META_VERIFY_TOKEN` should match what you set in your Meta webhook configuration 
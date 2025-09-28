# Configuration Files

This directory contains JSON configuration files for managing users and admin settings.

## Files

### `users.json`
Contains the list of users for Clockify monitoring.

```json
{
  "users": [
    {
      "name": "User Name",
      "clockifyId": "clockify_user_id",
      "phone": "phone_number_in_international_format"
    }
  ]
}
```

**Fields:**
- `name`: Display name of the user
- `clockifyId`: Clockify user ID (found in Clockify API)
- `phone`: Phone number in international format (e.g., "918590292642")

### `admins.json`
Contains admin phone numbers and event creator settings.

```json
{
  "adminPhones": [
    "918590292642",
    "919496649110"
  ],
  "eventCreatorNumber": "919746462423"
}
```

**Fields:**
- `adminPhones`: Array of admin phone numbers that receive Clockify alerts
- `eventCreatorNumber`: Phone number authorized to create Google Sheets events

## Hot Reload

The configuration files are automatically watched for changes. When you modify any JSON file:

1. The system automatically reloads the configuration
2. No server restart is required
3. Changes take effect immediately

## Adding New Users

1. Edit `config/users.json`
2. Add a new user object with `name`, `clockifyId`, and `phone`
3. Save the file
4. The system will automatically detect the change and reload

## Adding New Admins

1. Edit `config/admins.json`
2. Add the phone number to the `adminPhones` array
3. Save the file
4. The new admin will immediately start receiving alerts

## Validation

The system validates:
- Required fields are present
- Phone numbers are in correct format (10-15 digits)
- JSON syntax is valid

## Error Handling

If a configuration file has errors:
- The system will log the error
- It will fall back to empty arrays
- The application will continue running
- Fix the JSON and save to reload

## Example: Adding a New User

```json
{
  "users": [
    {
      "name": "John Doe",
      "clockifyId": "68c12043d442192cc9afcc21",
      "phone": "917907492827"
    }
  ]
}
```

## Example: Adding a New Admin

```json
{
  "adminPhones": [
    "918590292642",
    "919496649110",
    "917907492827"
  ],
  "eventCreatorNumber": "919746462423"
}
```

# HandsCarpet Store A Inventory & External API App

A custom Shopify App that allows Store A to view and manage inventory, generate secure external API tokens, and expose a dedicated read-only inventory API for Store B.

---

## 🏗 Architecture & Flow

```
[ Store A (Admin Dashboard) ]
        │
        ├─ Installs App (OAuth session stored in Prisma SQLite/DB)
        ├─ Views current Store A inventory (SKU, Stock, Locations)
        └─ Generates / Regenerates secure API Token (e.g. `hsk_...`)
        
[ Store B (External Store / Script / Server) ]
        │
        ▼ Calls: GET https://<app-domain>/api/inventory
        ▼ Header: Authorization: Bearer <STORE_A_TOKEN> (or ?token=<STORE_A_TOKEN>)
        
[ App Server ]
        │
        ├─ Authenticates token & verifies Store A
        ├─ Queries Store A live inventory via Shopify GraphQL Admin API
        └─ Returns clean JSON response with SKU, quantities, and locations
```

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: v20+ or v22+
- **Shopify Partner Account**: [Shopify Partners](https://partners.shopify.com/)
- **Development Store**: Create a development store (Store A) in your Partner dashboard.

### 2. Database Setup
The SQLite database schema is managed via Prisma:
```bash
npx prisma db push
```

### 3. Start Local Development
Run the development server with Shopify CLI:
```bash
npm run dev
```
When prompted:
1. Log in to your Shopify Partner account.
2. Select or create an app in your partner dashboard.
3. Select your development store (**Store A**) to install the app.
4. Shopify CLI will generate a secure tunnel (Cloudflare tunnel) and provide an installation URL.

---

## 🔑 External API (Store B Integration)

### Endpoint
- `GET /api/inventory` (or `GET /api/v1/inventory`)

### Authentication
Pass the token in the `Authorization` header, `X-Api-Key` header, or as a query parameter:
- **Header (Recommended)**: `Authorization: Bearer <TOKEN>`
- **Header**: `X-Api-Key: <TOKEN>`
- **Query Parameter**: `?token=<TOKEN>`

### Query Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| `sku` | string | Filter results by SKU (exact or partial match) |
| `limit` | number | Number of products to retrieve (default: 50, max: 250) |
| `cursor` | string | Pagination cursor (`endCursor` from previous response) |
| `query` | string | Generic Shopify product search query |

### Example cURL Request
```bash
curl -X GET "https://<YOUR_APP_URL>/api/inventory" \
  -H "Authorization: Bearer hsk_648f93a1059f2a0b12c4..."
```

### Example Store B Integration (JavaScript / Node.js)
```javascript
const response = await fetch("https://<YOUR_APP_URL>/api/inventory", {
  method: "GET",
  headers: {
    "Authorization": "Bearer hsk_648f93a1059f2a0b12c4...",
    "Content-Type": "application/json"
  }
});

const data = await response.json();
console.log(`Fetched ${data.totalItems} items for ${data.shop}`);
console.log(data.data);
```

### Example API Response
```json
{
  "success": true,
  "shop": "store-a.myshopify.com",
  "timestamp": "2026-11-19T11:45:00.000Z",
  "totalItems": 2,
  "pageInfo": {
    "hasNextPage": false,
    "endCursor": "eyJsYXN0X2lkIjo3ODkwMTIzfQ=="
  },
  "data": [
    {
      "productId": "gid://shopify/Product/8123456789",
      "productTitle": "Handmade Persian Rug 8x10",
      "productStatus": "ACTIVE",
      "variantId": "gid://shopify/ProductVariant/4455667788",
      "variantTitle": "Navy Blue / 8x10",
      "sku": "HND-RUG-001",
      "barcode": "8901234567890",
      "inventoryItemId": "gid://shopify/InventoryItem/4988776655",
      "tracked": true,
      "totalAvailable": 14,
      "levels": [
        {
          "locationId": "gid://shopify/Location/789123456",
          "locationName": "Main Warehouse",
          "quantities": {
            "available": 10,
            "on_hand": 12
          },
          "available": 10
        },
        {
          "locationId": "gid://shopify/Location/789123457",
          "locationName": "Showroom",
          "quantities": {
            "available": 4,
            "on_hand": 4
          },
          "available": 4
        }
      ]
    }
  ]
}
```

---

## 📁 Key Files & Structure

- [app/routes/app._index.tsx](file:///c:/Users/DELL/Desktop/web_dev/handscarpet%20inventory/app/routes/app._index.tsx): Merchant dashboard in Store A Admin (Token management, cURL instructions, and inventory table).
- [app/routes/api.inventory.ts](file:///c:/Users/DELL/Desktop/web_dev/handscarpet%20inventory/app/routes/api.inventory.ts): External REST endpoint called by Store B.
- [app/services/apiKey.server.ts](file:///c:/Users/DELL/Desktop/web_dev/handscarpet%20inventory/app/services/apiKey.server.ts): Token generation, validation, and regeneration logic.
- [app/services/inventory.server.ts](file:///c:/Users/DELL/Desktop/web_dev/handscarpet%20inventory/app/services/inventory.server.ts): Shopify GraphQL Admin query for inventory levels and locations.
- [prisma/schema.prisma](file:///c:/Users/DELL/Desktop/web_dev/handscarpet%20inventory/prisma/schema.prisma): Database schema containing `Session` and `ApiKey` models.
- [shopify.app.toml](file:///c:/Users/DELL/Desktop/web_dev/handscarpet%20inventory/shopify.app.toml): App configuration and permission scopes (`read_products,read_inventory,read_locations,write_inventory,write_products`).

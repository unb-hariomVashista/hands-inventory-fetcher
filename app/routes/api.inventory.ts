import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { unauthenticated } from "../shopify.server";
import { validateApiKey } from "../services/apiKey.server";
import { fetchStoreInventory } from "../services/inventory.server";

function isOriginAllowed(requestOrigin: string | null, allowedOriginsConfig: string | null): boolean {
  if (!allowedOriginsConfig || allowedOriginsConfig.trim() === "*" || !requestOrigin) {
    return true;
  }

  const allowedList = allowedOriginsConfig
    .split(",")
    .map((o) => o.trim().toLowerCase())
    .filter(Boolean);

  const cleanRequest = requestOrigin.trim().toLowerCase();

  return allowedList.some((allowed) => {
    if (allowed === "*" || allowed === cleanRequest) return true;
    try {
      const parsedRequestHost = new URL(cleanRequest).hostname;
      const parsedAllowedHost = allowed.includes("://") ? new URL(allowed).hostname : allowed;
      return parsedRequestHost === parsedAllowedHost;
    } catch {
      return false;
    }
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  const requestOrigin = request.headers.get("Origin");

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": requestOrigin || "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Api-Key",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // 1. Extract token from Authorization header or URL query parameter
  const authHeader = request.headers.get("Authorization");
  const xApiKey = request.headers.get("X-Api-Key");
  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token");

  let token = queryToken || xApiKey;
  if (!token && authHeader) {
    if (authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7).trim();
    } else {
      token = authHeader.trim();
    }
  }

  if (!token) {
    return json(
      {
        success: false,
        error: "Unauthorized",
        message:
          "Missing API token. Provide Bearer token in Authorization header, X-Api-Key header, or ?token= query parameter.",
      },
      {
        status: 401,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      }
    );
  }

  // 2. Validate token
  const apiKeyRecord = await validateApiKey(token);
  if (!apiKeyRecord) {
    return json(
      {
        success: false,
        error: "Unauthorized",
        message: "Invalid or inactive API token.",
      },
      {
        status: 401,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      }
    );
  }

  // 3. Verify CORS Origin Whitelist for this specific store's API key
  const allowedOrigins = (apiKeyRecord as any).allowedOrigins || "*";
  if (!isOriginAllowed(requestOrigin, allowedOrigins)) {
    return json(
      {
        success: false,
        error: "Forbidden",
        message: `Origin '${requestOrigin}' is not authorized to access Store A's inventory. Check Allowed Origins in the app settings.`,
      },
      {
        status: 403,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }

  const corsHeaders = {
    "Access-Control-Allow-Origin": requestOrigin || "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Api-Key",
  };

  // 4. Connect to Store A via unauthenticated admin client
  try {
    const { admin } = await unauthenticated.admin(apiKeyRecord.shop);

    // 5. Parse query options
    const limit = url.searchParams.get("limit")
      ? parseInt(url.searchParams.get("limit")!, 10)
      : 50;
    const cursor = url.searchParams.get("cursor");
    const sku = url.searchParams.get("sku");
    const query = url.searchParams.get("query");

    // 6. Fetch inventory
    const inventoryResult = await fetchStoreInventory(admin, {
      first: isNaN(limit) ? 50 : limit,
      after: cursor,
      sku,
      query,
    });

    return json(
      {
        success: true,
        shop: apiKeyRecord.shop,
        timestamp: new Date().toISOString(),
        totalItems: inventoryResult.items.length,
        pageInfo: inventoryResult.pageInfo,
        data: inventoryResult.items,
      },
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error: any) {
    console.error("Error retrieving inventory for shop:", apiKeyRecord.shop, error);
    return json(
      {
        success: false,
        error: "Internal Server Error",
        message:
          error?.message ||
          "Failed to fetch inventory from Shopify. Ensure the app has offline access permissions.",
      },
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
}

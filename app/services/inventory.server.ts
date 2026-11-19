export interface InventoryLevelDetail {
  locationId: string;
  locationName: string;
  quantities: Record<string, number>;
  available: number;
}

export interface InventoryItemOutput {
  productId: string;
  productTitle: string;
  productStatus: string;
  variantId: string;
  variantTitle: string;
  sku: string | null;
  barcode: string | null;
  inventoryItemId: string | null;
  tracked: boolean;
  totalAvailable: number;
  levels: InventoryLevelDetail[];
}

export interface FetchInventoryOptions {
  first?: number;
  after?: string | null;
  sku?: string | null;
  query?: string | null;
}

export async function fetchStoreInventory(
  admin: { graphql: (query: string, options?: { variables?: Record<string, any> }) => Promise<Response> },
  options: FetchInventoryOptions = {}
) {
  const { first = 50, after = null, sku = null, query: customQuery = null } = options;

  let searchFilter = "";
  if (sku) {
    searchFilter = `sku:${sku}`;
  } else if (customQuery) {
    searchFilter = customQuery;
  }

  const query = `#graphql
    query getStoreInventory($first: Int!, $after: String, $query: String) {
      products(first: $first, after: $after, query: $query) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          title
          status
          variants(first: 50) {
            nodes {
              id
              title
              sku
              barcode
              inventoryQuantity
              inventoryItem {
                id
                tracked
                inventoryLevels(first: 10) {
                  nodes {
                    id
                    location {
                      id
                      name
                    }
                    quantities(names: ["available", "on_hand"]) {
                      name
                      quantity
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const response = await admin.graphql(query, {
    variables: {
      first: Math.min(Math.max(1, first), 250),
      after: after || undefined,
      query: searchFilter || undefined,
    },
  });

  const responseJson = await response.json();

  if (responseJson.errors) {
    throw new Error(
      `Shopify GraphQL Error: ${responseJson.errors.map((e: any) => e.message).join(", ")}`
    );
  }

  const productsData = responseJson.data?.products;
  const items: InventoryItemOutput[] = [];

  if (productsData?.nodes) {
    for (const product of productsData.nodes) {
      const variants = product.variants?.nodes || [];
      for (const variant of variants) {
        const invItem = variant.inventoryItem;
        const levels: InventoryLevelDetail[] = [];

        if (invItem?.inventoryLevels?.nodes) {
          for (const level of invItem.inventoryLevels.nodes) {
            const quantitiesMap: Record<string, number> = {};
            let availableQty = 0;

            if (level.quantities) {
              for (const q of level.quantities) {
                quantitiesMap[q.name] = q.quantity;
                if (q.name === "available") {
                  availableQty = q.quantity;
                }
              }
            }

            levels.push({
              locationId: level.location?.id || "",
              locationName: level.location?.name || "Unknown",
              quantities: quantitiesMap,
              available: availableQty,
            });
          }
        }

        items.push({
          productId: product.id,
          productTitle: product.title,
          productStatus: product.status,
          variantId: variant.id,
          variantTitle: variant.title === "Default Title" ? "" : variant.title,
          sku: variant.sku || null,
          barcode: variant.barcode || null,
          inventoryItemId: invItem?.id || null,
          tracked: Boolean(invItem?.tracked),
          totalAvailable: variant.inventoryQuantity ?? 0,
          levels,
        });
      }
    }
  }

  return {
    items,
    pageInfo: productsData?.pageInfo || { hasNextPage: false, endCursor: null },
  };
}

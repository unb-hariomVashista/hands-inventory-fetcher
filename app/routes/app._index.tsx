import { useState, useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useActionData, useLoaderData, useSubmit } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  BlockStack,
  InlineStack,
  Box,
  Banner,
  Badge,
  IndexTable,
  TextField,
  Divider,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  getOrCreateApiKey,
  regenerateApiKey,
  updateAllowedOrigins,
} from "../services/apiKey.server";
import {
  fetchStoreInventory,
  type InventoryItemOutput,
} from "../services/inventory.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  // 1. Ensure API Key exists for this store
  const apiKeyRecord = await getOrCreateApiKey(session.shop);

  // 2. Fetch current store inventory
  let inventoryItems: InventoryItemOutput[] = [];
  let fetchError: string | null = null;
  try {
    const invResult = await fetchStoreInventory(admin, { first: 50 });
    inventoryItems = invResult.items;
  } catch (err: any) {
    console.error("Failed to load inventory:", err);
    fetchError = err.message || "Failed to load store inventory";
  }

  // 3. Determine external API base URL (enforce https for tunnel/production)
  const url = new URL(request.url);
  const proto =
    request.headers.get("x-forwarded-proto") ||
    (url.hostname === "localhost" ? "http" : "https");
  const host = request.headers.get("x-forwarded-host") || url.host;
  const externalApiUrl = `${proto}://${host}/api/inventory`;

  return json({
    shop: session.shop,
    apiKey: {
      token: apiKeyRecord.token,
      isActive: apiKeyRecord.isActive,
      allowedOrigins: (apiKeyRecord as any).allowedOrigins || "*",
      createdAt: apiKeyRecord.createdAt.toISOString(),
      lastUsedAt: apiKeyRecord.lastUsedAt
        ? apiKeyRecord.lastUsedAt.toISOString()
        : null,
    },
    inventory: inventoryItems,
    fetchError,
    externalApiUrl,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "regenerateToken") {
    const newApiKey = await regenerateApiKey(session.shop);
    return json({
      success: true,
      action: "regenerateToken",
      token: newApiKey.token,
    });
  }

  if (intent === "updateAllowedOrigins") {
    const origins = (formData.get("allowedOrigins") as string) || "*";
    await updateAllowedOrigins(session.shop, origins);
    return json({
      success: true,
      action: "updateAllowedOrigins",
      allowedOrigins: origins,
    });
  }

  return json({ success: false, error: "Invalid action" });
};

export default function InventoryDashboard() {
  const {
    shop,
    apiKey: initialApiKey,
    inventory,
    fetchError,
    externalApiUrl,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();

  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [allowedOrigins, setAllowedOrigins] = useState(
    initialApiKey.allowedOrigins || "*"
  );
  const [originsSavedBanner, setOriginsSavedBanner] = useState(false);

  const currentToken =
    actionData &&
    "action" in actionData &&
    actionData.action === "regenerateToken"
      ? (actionData as any).token
      : initialApiKey.token;

  useEffect(() => {
    if (
      actionData &&
      "action" in actionData &&
      actionData.action === "updateAllowedOrigins"
    ) {
      setOriginsSavedBanner(true);
      setTimeout(() => setOriginsSavedBanner(false), 4000);
    }
  }, [actionData]);

  const handleCopyToken = () => {
    navigator.clipboard.writeText(currentToken);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2500);
  };

  const curlCommand = `curl -H "Authorization: Bearer ${currentToken}" "${externalApiUrl}"`;

  const handleCopyCurl = () => {
    navigator.clipboard.writeText(curlCommand);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2500);
  };

  const handleRegenerate = () => {
    if (
      window.confirm(
        "Are you sure you want to regenerate this API token? Any external store (Store B) using the old token will lose access until updated."
      )
    ) {
      submit({ intent: "regenerateToken" }, { method: "POST" });
    }
  };

  const handleSaveOrigins = () => {
    submit(
      { intent: "updateAllowedOrigins", allowedOrigins },
      { method: "POST" }
    );
  };

  const filteredInventory = inventory.filter((item: any) => {
    const term = searchFilter.toLowerCase();
    return (
      item.productTitle.toLowerCase().includes(term) ||
      (item.variantTitle && item.variantTitle.toLowerCase().includes(term)) ||
      (item.sku && item.sku.toLowerCase().includes(term)) ||
      (item.barcode && item.barcode.toLowerCase().includes(term))
    );
  });

  const rowMarkup = filteredInventory.map(
    (
      {
        variantId,
        productTitle,
        variantTitle,
        sku,
        barcode,
        totalAvailable,
        levels,
        productStatus,
      }: any,
      index: number
    ) => (
      <IndexTable.Row id={variantId} key={variantId} position={index}>
        <IndexTable.Cell>
          <BlockStack gap="050">
            <Text variant="bodyMd" fontWeight="bold" as="span">
              {productTitle}
            </Text>
            {variantTitle && (
              <Text variant="bodySm" tone="subdued" as="span">
                Variant: {variantTitle}
              </Text>
            )}
          </BlockStack>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text variant="bodyMd" as="span">
            {sku || "—"}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text variant="bodyMd" as="span">
            {barcode || "—"}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone={totalAvailable > 0 ? "success" : "critical"}>
            {`${totalAvailable} in stock`}
          </Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          {levels && levels.length > 0 ? (
            <BlockStack gap="050">
              {levels.map((lvl: any) => (
                <Text
                  key={lvl.locationId}
                  variant="bodySm"
                  tone="subdued"
                  as="span"
                >
                  {lvl.locationName}: <strong>{lvl.available}</strong>
                </Text>
              ))}
            </BlockStack>
          ) : (
            <Text variant="bodySm" tone="subdued" as="span">
              No location data
            </Text>
          )}
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge
            tone={
              productStatus === "ACTIVE"
                ? "success"
                : productStatus === "DRAFT"
                ? "warning"
                : undefined
            }
          >
            {productStatus}
          </Badge>
        </IndexTable.Cell>
      </IndexTable.Row>
    )
  );

  return (
    <Page fullWidth>
      <TitleBar title="Store Inventory & API Access" />
      <BlockStack gap="500">
        {originsSavedBanner && (
          <Banner
            title="Allowed store origins updated successfully."
            tone="success"
            onDismiss={() => setOriginsSavedBanner(false)}
          />
        )}
        {fetchError && (
          <Banner title="Failed to fetch some inventory items" tone="critical">
            <p>{fetchError}</p>
          </Banner>
        )}

        <Layout>
          {/* Left Column: API Configuration & Store B Integration */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingMd" as="h2">
                    Store B Integration (External Access)
                  </Text>
                  <Badge tone={initialApiKey.isActive ? "success" : "critical"}>
                    {initialApiKey.isActive ? "Active" : "Disabled"}
                  </Badge>
                </InlineStack>

                <Text as="p" tone="subdued">
                  Use this token to allow Store B to query live inventory from
                  this store (<strong>{shop}</strong>) via HTTP GET requests.
                </Text>

                <Divider />

                <BlockStack gap="200">
                  <Text variant="headingSm" as="h3">
                    API Secret Token
                  </Text>
                  <InlineStack gap="200" blockAlign="center">
                    <Box minWidth="340px">
                      <TextField
                        label="Token"
                        labelHidden
                        value={currentToken}
                        readOnly
                        autoComplete="off"
                        monospaced
                      />
                    </Box>
                    <Button onClick={handleCopyToken}>
                      {copiedToken ? "Copied!" : "Copy Token"}
                    </Button>
                    <Button tone="critical" onClick={handleRegenerate}>
                      Regenerate
                    </Button>
                  </InlineStack>
                  {initialApiKey.lastUsedAt && (
                    <Text variant="bodySm" tone="subdued" as="span">
                      Last accessed:{" "}
                      {new Date(initialApiKey.lastUsedAt).toLocaleString()}
                    </Text>
                  )}
                </BlockStack>

                <Divider />

                {/* CORS & Allowed Origins Whitelist */}
                <BlockStack gap="200">
                  <Text variant="headingSm" as="h3">
                    Allowed Store Origins (CORS Whitelist)
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Restrict browser requests from Store B. Enter Store B&apos;s
                    domain(s) separated by commas, or leave as <code>*</code> to
                    allow any store domain with a valid token:
                  </Text>
                  <InlineStack gap="200" blockAlign="center">
                    <Box minWidth="340px">
                      <TextField
                        label="Allowed Origins"
                        labelHidden
                        placeholder="e.g. store-b.myshopify.com, https://store-b.com"
                        value={allowedOrigins}
                        onChange={setAllowedOrigins}
                        autoComplete="off"
                      />
                    </Box>
                    <Button onClick={handleSaveOrigins}>Save Origins</Button>
                  </InlineStack>
                </BlockStack>

                <Divider />

                <BlockStack gap="200">
                  <Text variant="headingSm" as="h3">
                    API Endpoint
                  </Text>
                  <TextField
                    label="Endpoint URL"
                    labelHidden
                    value={externalApiUrl}
                    readOnly
                    autoComplete="off"
                    monospaced
                  />
                  <Text variant="bodySm" tone="subdued" as="p">
                    Query parameters supported: <code>?sku=YOUR_SKU</code>,{" "}
                    <code>?limit=50</code>, <code>?cursor=NEXT_PAGE</code>
                  </Text>
                </BlockStack>

                <BlockStack gap="200">
                  <Text variant="headingSm" as="h3">
                    cURL Command Example
                  </Text>
                  <Box
                    background="bg-surface-secondary"
                    padding="300"
                    borderRadius="200"
                  >
                    <pre
                      style={{
                        margin: 0,
                        fontSize: "12px",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-all",
                        fontFamily: "monospace",
                      }}
                    >
                      {curlCommand}
                    </pre>
                  </Box>
                  <InlineStack align="end">
                    <Button onClick={handleCopyCurl} size="slim">
                      {copiedCurl ? "Copied cURL!" : "Copy cURL"}
                    </Button>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Right / Secondary Column: How it Works */}
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">
                  How it works
                </Text>
                <Text as="p" tone="subdued">
                  1. <strong>Store A</strong> installs this app and generates a
                  secure API token.
                </Text>
                <Text as="p" tone="subdued">
                  2. Optionally specify <strong>Store B&apos;s domain</strong> in
                  the Allowed Origins list to lock down browser calls.
                </Text>
                <Text as="p" tone="subdued">
                  3. <strong>Store B</strong> makes HTTP requests to read Store
                  A&apos;s real-time inventory without needing direct Shopify admin
                  credentials.
                </Text>
                <Text as="p" tone="subdued">
                  4. If needed, click <strong>Regenerate</strong> anytime to
                  immediately revoke the old token.
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Inventory Table Section */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text variant="headingMd" as="h2">
                  Store Inventory
                </Text>
                <Text variant="bodySm" tone="subdued" as="p">
                  Showing {filteredInventory.length} of {inventory.length} items
                  from Store A
                </Text>
              </BlockStack>
              <Box minWidth="260px">
                <TextField
                  label="Search inventory"
                  labelHidden
                  placeholder="Filter by title, SKU, or barcode..."
                  value={searchFilter}
                  onChange={setSearchFilter}
                  clearButton
                  onClearButtonClick={() => setSearchFilter("")}
                  autoComplete="off"
                />
              </Box>
            </InlineStack>

            <IndexTable
              resourceName={{ singular: "item", plural: "items" }}
              itemCount={filteredInventory.length}
              headings={[
                { title: "Product / Variant" },
                { title: "SKU" },
                { title: "Barcode" },
                { title: "Total Available" },
                { title: "Locations" },
                { title: "Status" },
              ]}
              selectable={false}
            >
              {rowMarkup}
            </IndexTable>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

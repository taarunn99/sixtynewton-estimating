// Zoho Books API client using the refresh token grant. Server only.

const ACCOUNTS_BASE = process.env.ZOHO_ACCOUNTS_BASE ?? "https://accounts.zoho.com";
const API_BASE = process.env.ZOHO_API_BASE ?? "https://www.zohoapis.com";

export type ZohoItem = {
  item_id: string;
  name: string;
  sku?: string;
  brand?: string;
  unit?: string;
  rate?: number;
  purchase_rate?: number;
  stock_on_hand?: number;
  status?: string;
};

export async function getAccessToken(): Promise<string> {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Zoho credentials missing: set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET and ZOHO_REFRESH_TOKEN");
  }
  const res = await fetch(`${ACCOUNTS_BASE}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`Zoho token refresh failed: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data.access_token as string;
}

export async function* iterateActiveItems(accessToken: string): AsyncGenerator<ZohoItem[]> {
  const orgId = process.env.ZOHO_ORG_ID ?? "719219457";
  let page = 1;
  for (;;) {
    const url = `${API_BASE}/books/v3/items?organization_id=${orgId}&filter_by=Status.Active&per_page=200&page=${page}`;
    const res = await fetch(url, {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Zoho items page ${page} failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    yield (data.items ?? []) as ZohoItem[];
    if (!data.page_context?.has_more_page) break;
    page++;
  }
}

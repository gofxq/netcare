import { readFile } from "node:fs/promises";
import { canonicalIP } from "../src/network.js";

const databases = {
  dbip: "NETCARE_DBIP_MMDB",
  geolite2: "NETCARE_GEOLITE2_MMDB",
  "ipip-2023": "NETCARE_IPIP_MMDB",
  cz88: "NETCARE_CZ88_MMDB",
};

const services = {
  "ip-api": {
    key: "NETCARE_IP_API_KEY",
    url: (ip, key) =>
      `https://pro.ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,as,isp,org&key=${key}`,
    extract: (d) => ({
      country: d.country,
      countryCode: d.countryCode,
      region: d.regionName,
      city: d.city,
      ...splitASN(d.as),
      isp: d.isp,
    }),
  },
  ipdata: {
    key: "NETCARE_IPDATA_KEY",
    url: (ip, key) => `https://api.ipdata.co/${ip}?api-key=${key}`,
    extract: (d) => ({
      ...d,
      country: d.country_name,
      countryCode: d.country_code,
      asn: d.asn?.asn,
      asnOrg: d.asn?.name,
    }),
  },
  "geo-ipify": {
    key: "NETCARE_IPIFY_KEY",
    url: (ip, key) =>
      `https://geo.ipify.org/api/v2/country,city?ipAddress=${ip}&apiKey=${key}`,
    extract: (d) => ({
      ...d.location,
      countryCode: d.location?.country,
      asn: d.as?.asn,
      asnOrg: d.as?.name,
      isp: d.isp,
    }),
  },
  ipregistry: {
    key: "NETCARE_IPREGISTRY_KEY",
    url: (ip) => `https://api.ipregistry.co/${ip}`,
    headers: (key) => ({ authorization: `ApiKey ${key}` }),
    extract: (d) => ({
      country: d.location?.country?.name,
      countryCode: d.location?.country?.code,
      region: d.location?.region?.name,
      city: d.location?.city,
      asn: d.connection?.asn,
      asnOrg: d.connection?.organization,
      isp: d.connection?.organization,
    }),
  },
  ipstack: {
    key: "NETCARE_IPSTACK_KEY",
    url: (ip, key) => `https://api.ipstack.com/${ip}?access_key=${key}`,
    extract: (d) => ({
      country: d.country_name,
      countryCode: d.country_code,
      region: d.region_name,
      city: d.city,
      asn: d.connection?.asn,
      asnOrg: d.connection?.organization,
      isp: d.connection?.isp,
    }),
  },
};

function splitASN(value) {
  const match = typeof value === "string" && value.match(/^AS(\d+)\s*(.*)$/i);
  return match ? { asn: match[1], asnOrg: match[2] } : {};
}

function placeName(value) {
  return typeof value === "string"
    ? value
    : value?.names?.["zh-CN"] || value?.names?.en || value?.name;
}

export function mmdbFields(record) {
  if (!record) return null;
  return {
    country: placeName(record.country),
    countryCode: record.country?.iso_code || record.country_code,
    region: placeName(
      record.subdivisions?.[0] || record.region || record.province,
    ),
    city: placeName(record.city),
    asn:
      record.autonomous_system_number ||
      record.traits?.autonomous_system_number,
    asnOrg:
      record.autonomous_system_organization ||
      record.traits?.autonomous_system_organization,
    isp: record.isp || record.traits?.isp,
  };
}

function isLocalRequest(req) {
  const address = req.socket.remoteAddress || "";
  const loopback = address === "::1" || /^(?:::ffff:)?127\./.test(address);
  return loopback && req.headers["sec-fetch-site"] !== "cross-site";
}

function send(res, status, body) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

export function geoLookupPlugin(env) {
  const readers = new Map();

  const serve = async (req, res, next) => {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/api/geo/")) return next();
    if (req.method !== "GET")
      return send(res, 405, { error: "Method not allowed" });
    if (!isLocalRequest(req))
      return send(res, 403, { error: "Local access only" });
    const ip = canonicalIP(url.searchParams.get("ip"));
    if (!ip) return send(res, 400, { error: "Invalid IP address" });

    const id = url.pathname.slice("/api/geo/".length);
    if (Object.hasOwn(databases, id)) {
      const path = env[databases[id]];
      if (!path) return send(res, 428, { error: "Database path required" });
      try {
        if (!readers.has(path)) {
          const reader = Promise.all([import("mmdb-lib"), readFile(path)])
            .then(([{ Reader }, content]) => new Reader(content))
            .catch((error) => {
              readers.delete(path);
              throw error;
            });
          readers.set(path, reader);
        }
        return send(res, 200, mmdbFields((await readers.get(path)).get(ip)));
      } catch {
        return send(res, 502, { error: "Unable to read MMDB" });
      }
    }
    if (!Object.hasOwn(services, id))
      return send(res, 404, { error: "Unknown data source" });

    const source = services[id];
    const key = env[source.key];
    if (!key) return send(res, 428, { error: "API key required" });
    const controller = new AbortController();
    const cancel = () => controller.abort();
    res.once("close", cancel);
    try {
      const response = await fetch(
        source.url(encodeURIComponent(ip), encodeURIComponent(key)),
        {
          headers: source.headers?.(key),
          redirect: "error",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(7000),
          ]),
        },
      );
      if (!response.ok)
        return send(res, response.status === 429 ? 429 : 502, {
          error: "Upstream request failed",
        });
      const data = await response.json();
      if (
        !data ||
        data.error ||
        data.success === false ||
        data.status === "fail"
      )
        return send(res, 200, null);
      return send(res, 200, source.extract(data));
    } catch {
      return send(res, 502, { error: "Upstream request failed" });
    } finally {
      res.off("close", cancel);
    }
  };

  const attach = (server) => {
    server.middlewares.use((req, res, next) => {
      void serve(req, res, next).catch(next);
    });
  };
  return {
    name: "netcare-local-geo",
    configureServer: attach,
    configurePreviewServer: attach,
  };
}

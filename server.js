const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

const locations = [
  { id: "J01", name: "Sitabuldi Junction", lat: 21.1458, lng: 79.0882, traffic: 92, congestion: 88, accidents: 8, incidents: 5, violations: 72, pedestrians: 90, current: 2, required: 4 },
  { id: "J02", name: "Sadar Main Road", lat: 21.1669, lng: 79.0805, traffic: 80, congestion: 74, accidents: 6, incidents: 3, violations: 61, pedestrians: 75, current: 3, required: 3 },
  { id: "J03", name: "Wardha Road", lat: 21.1065, lng: 79.0748, traffic: 86, congestion: 82, accidents: 7, incidents: 4, violations: 65, pedestrians: 62, current: 1, required: 4 },
  { id: "J04", name: "Manish Nagar", lat: 21.1085, lng: 79.0668, traffic: 68, congestion: 62, accidents: 4, incidents: 2, violations: 48, pedestrians: 58, current: 1, required: 2 },
  { id: "J05", name: "Dharampeth", lat: 21.144, lng: 79.0645, traffic: 61, congestion: 55, accidents: 3, incidents: 1, violations: 41, pedestrians: 70, current: 2, required: 2 },
  { id: "J06", name: "Kamptee Road", lat: 21.174, lng: 79.1, traffic: 78, congestion: 72, accidents: 5, incidents: 3, violations: 57, pedestrians: 52, current: 0, required: 3 },
  { id: "J07", name: "Medical Square", lat: 21.125, lng: 79.091, traffic: 75, congestion: 70, accidents: 6, incidents: 4, violations: 54, pedestrians: 82, current: 1, required: 3 },
  { id: "J08", name: "Ajni Square", lat: 21.1215, lng: 79.082, traffic: 70, congestion: 64, accidents: 4, incidents: 2, violations: 46, pedestrians: 63, current: 1, required: 2 },
  { id: "J09", name: "Ravi Nagar", lat: 21.137, lng: 79.054, traffic: 54, congestion: 48, accidents: 2, incidents: 1, violations: 36, pedestrians: 55, current: 2, required: 1 },
  { id: "J10", name: "Airport Road", lat: 21.113, lng: 79.049, traffic: 64, congestion: 58, accidents: 3, incidents: 2, violations: 43, pedestrians: 45, current: 1, required: 2 },
  { id: "J11", name: "Mahal", lat: 21.142, lng: 79.103, traffic: 72, congestion: 67, accidents: 5, incidents: 2, violations: 52, pedestrians: 78, current: 1, required: 3 },
  { id: "J12", name: "Bardi", lat: 21.152, lng: 79.088, traffic: 83, congestion: 80, accidents: 7, incidents: 4, violations: 68, pedestrians: 84, current: 2, required: 4 }
];

const resources = {
  police: [
    { id: "P01", name: "Police Unit P01", lat: 21.1465, lng: 79.087, status: "Available" },
    { id: "P02", name: "Police Unit P02", lat: 21.166, lng: 79.081, status: "Available" },
    { id: "P03", name: "Police Unit P03", lat: 21.108, lng: 79.067, status: "Available" },
    { id: "P04", name: "Police Unit P04", lat: 21.139, lng: 79.101, status: "Available" },
    { id: "P05", name: "Police Unit P05", lat: 21.122, lng: 79.0825, status: "Busy" }
  ],
  ambulances: [
    { id: "A01", name: "Demo Ambulance A01", lat: 21.126, lng: 79.092, status: "Available", hospital: "Demo Medical Center" },
    { id: "A02", name: "Demo Ambulance A02", lat: 21.108, lng: 79.073, status: "Available", hospital: "Demo General Hospital" },
    { id: "A03", name: "Demo Ambulance A03", lat: 21.151, lng: 79.097, status: "Busy", hospital: "Demo City Hospital" }
  ]
};

let incidents = [];

function riskScore(location) {
  const score = Math.round(
    location.traffic * 0.22 +
    location.congestion * 0.20 +
    Math.min(location.accidents * 10, 100) * 0.18 +
    Math.min(location.incidents * 15, 100) * 0.15 +
    location.violations * 0.10 +
    location.pedestrians * 0.08 +
    60 * 0.07
  );

  return Math.max(0, Math.min(100, score));
}

function level(score) {
  return score >= 80 ? "Critical" :
    score >= 60 ? "High" :
    score >= 40 ? "Medium" : "Low";
}

function enrich(location) {
  const score = riskScore(location);
  const required = Math.max(
    location.required,
    score >= 90 ? 4 :
    score >= 80 ? 3 :
    score >= 60 ? 2 : 1
  );
  const gap = Math.max(required - location.current, 0);

  return {
    ...location,
    riskScore: score,
    riskLevel: level(score),
    requiredResponseUnits: required,
    responseGap: gap,
    priorityScore: Math.round(score + gap * 8 + (gap > 0 ? 8 : 0))
  };
}

function nearest(lat, lng, list) {
  if (!list.length) return null;

  const earthRadius = 6371;
  const radians = Math.PI / 180;

  return list
    .map(resource => {
      const dLat = (resource.lat - lat) * radians;
      const dLng = (resource.lng - lng) * radians;

      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat * radians) *
        Math.cos(resource.lat * radians) *
        Math.sin(dLng / 2) ** 2;

      return {
        ...resource,
        distanceKm: +(
          2 * earthRadius * Math.asin(Math.sqrt(a))
        ).toFixed(2)
      };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm)[0];
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });

  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise(resolve => {
    let data = "";

    req.on("data", chunk => {
      data += chunk;
    });

    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

function serveFrontend(req, res) {
  let requestPath = req.url === "/"
    ? "/index.html"
    : url.parse(req.url).pathname;

  try {
    requestPath = decodeURIComponent(requestPath);
  } catch {
    res.writeHead(400);
    return res.end("Invalid request path");
  }

  const frontendRoot = path.resolve(__dirname, "../frontend");
  const requestedFile = path.resolve(frontendRoot, "." + requestPath);

  if (
    requestedFile !== frontendRoot &&
    !requestedFile.startsWith(frontendRoot + path.sep)
  ) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(requestedFile, (error, data) => {
    if (error) {
      res.writeHead(404, {
        "Content-Type": "text/plain; charset=utf-8"
      });
      return res.end("NAGRIK: Page not found");
    }

    const extension = path.extname(requestedFile).toLowerCase();

    res.writeHead(200, {
      "Content-Type": contentTypes[extension] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });

    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const { pathname } = url.parse(req.url, true);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    return res.end();
  }

  if (req.method === "GET" && pathname === "/api/health") {
    return sendJson(res, 200, {
      ok: true,
      project: "NAGRIK",
      status: "online",
      timestamp: new Date().toISOString()
    });
  }

  if (req.method === "GET" && pathname === "/api/locations") {
    return sendJson(res, 200, locations.map(enrich));
  }

  if (req.method === "GET" && pathname === "/api/resources") {
    return sendJson(res, 200, resources);
  }

  if (req.method === "GET" && pathname === "/api/incidents") {
    return sendJson(res, 200, incidents);
  }

  if (req.method === "POST" && pathname === "/api/incidents") {
    const body = await parseBody(req);
    const location =
      locations.find(item => item.id === body.locationId) ||
      locations[0];

    const base = enrich(location);

    const incident = {
      id: "INC-" + String(Date.now()).slice(-6),
      locationId: location.id,
      locationName: location.name,
      lat: location.lat,
      lng: location.lng,
      severity: body.severity || "Severe",
      description: body.description || "Accident reported",
      createdAt: new Date().toISOString(),
      status: "Recommendation Ready",
      riskBefore: base.riskScore,
      riskAfter: Math.min(100, base.riskScore + 22),
      responseGapBefore: base.responseGap,
      responseGapAfter: Math.max(base.responseGap, 3),
      nearestPolice: nearest(
        location.lat,
        location.lng,
        resources.police.filter(unit => unit.status === "Available")
      ),
      nearestAmbulance: nearest(
        location.lat,
        location.lng,
        resources.ambulances.filter(
          ambulance => ambulance.status === "Available"
        )
      ),
      timeline: [
        "Incident reported",
        "Risk recalculated",
        "Response gap recalculated",
        "Nearest police and ambulance identified",
        "Coordinated response recommendation prepared"
      ]
    };

    incidents.unshift(incident);
    return sendJson(res, 201, incident);
  }

  if (req.method === "POST" && pathname === "/api/demo/reset") {
    incidents = [];
    return sendJson(res, 200, {
      ok: true,
      message: "NAGRIK demo data reset"
    });
  }

  serveFrontend(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`NAGRIK running on ${HOST}:${PORT}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

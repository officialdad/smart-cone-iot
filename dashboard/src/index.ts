import { Hono } from 'hono'

type Bindings = {
  MQTT_BROKER_WSS: string
  MQTT_USER: string
  MQTT_PASSWORD: string
  CONE_LOCATIONS: KVNamespace
}

const app = new Hono<{ Bindings: Bindings }>()

// GET /api/cones — list all cone locations
app.get('/api/cones', async (c) => {
  const list = await c.env.CONE_LOCATIONS.list({ prefix: 'cone:' });
  const cones = await Promise.all(
    list.keys.map(async (key) => {
      const value = await c.env.CONE_LOCATIONS.get(key.name, 'json');
      return value;
    })
  );
  return c.json(cones.filter(Boolean));
});

// POST /api/cones — create/update a cone location
app.post('/api/cones', async (c) => {
  const body = await c.req.json();
  const { cone_id, lat, lng, label } = body;
  if (!cone_id || lat == null || lng == null) {
    return c.json({ error: 'cone_id, lat, lng required' }, 400);
  }
  const cone = {
    cone_id,
    lat: Number(lat),
    lng: Number(lng),
    label: label || '',
    placed_at: new Date().toISOString(),
  };
  await c.env.CONE_LOCATIONS.put(`cone:${cone_id}`, JSON.stringify(cone));
  return c.json(cone, 201);
});

// DELETE /api/cones/:id — remove a cone
app.delete('/api/cones/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.CONE_LOCATIONS.delete(`cone:${id}`);
  return c.json({ deleted: id });
});

// GET /api/hazards — JSON hazard zones derived from cone positions
app.get('/api/hazards', async (c) => {
  const list = await c.env.CONE_LOCATIONS.list({ prefix: 'cone:' });
  const cones = (await Promise.all(
    list.keys.map(async (key) => {
      const value = await c.env.CONE_LOCATIONS.get(key.name, 'json');
      return value;
    })
  )).filter(Boolean) as Array<{cone_id: string; lat: number; lng: number; label: string; placed_at: string}>;

  if (cones.length < 1) {
    return c.json({ active: false, zones: [] });
  }

  // Calculate bounding box from cone positions
  const lats = cones.map(c => c.lat);
  const lngs = cones.map(c => c.lng);
  const zone = {
    type: cones.length >= 3 ? 'road_closure' : 'construction',
    severity: 'normal',
    cone_count: cones.length,
    start: { lat: Math.min(...lats), lng: Math.min(...lngs) },
    end: { lat: Math.max(...lats), lng: Math.max(...lngs) },
    center: { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lng: (Math.min(...lngs) + Math.max(...lngs)) / 2 },
    cones: cones.map(c => ({ id: c.cone_id, lat: c.lat, lng: c.lng, label: c.label })),
    created_at: cones.reduce((earliest, c) => c.placed_at < earliest ? c.placed_at : earliest, cones[0].placed_at),
  };

  return c.json({ active: true, zones: [zone] });
});

// GET /api/feed/cifs.xml — Waze-compatible CIFS XML feed
app.get('/api/feed/cifs.xml', async (c) => {
  const list = await c.env.CONE_LOCATIONS.list({ prefix: 'cone:' });
  const cones = (await Promise.all(
    list.keys.map(async (key) => {
      const value = await c.env.CONE_LOCATIONS.get(key.name, 'json');
      return value;
    })
  )).filter(Boolean) as Array<{cone_id: string; lat: number; lng: number; label: string; placed_at: string}>;

  const now = new Date().toISOString();
  let incidents = '';

  if (cones.length >= 1) {
    const polyline = cones.map(c => `${c.lat.toFixed(6)} ${c.lng.toFixed(6)}`).join(' ');
    const street = cones[0].label || 'Construction Zone';
    const starttime = cones.reduce((earliest, c) => c.placed_at < earliest ? c.placed_at : earliest, cones[0].placed_at);
    const description = `Smart Cone monitored work zone - ${cones.length} cones deployed`;

    incidents = `
  <incident id="smartcone-zone-1">
    <type>ROAD_CLOSED</type>
    <subtype>ROAD_CLOSED_CONSTRUCTION</subtype>
    <polyline>${polyline}</polyline>
    <street>${street}</street>
    <direction>BOTH_DIRECTIONS</direction>
    <description>${description}</description>
    <starttime>${starttime}</starttime>
    <updatetime>${now}</updatetime>
    <creationtime>${starttime}</creationtime>
  </incident>`;
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<incidents xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" timestamp="${now}">${incidents}
</incidents>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
});

// GET /api/feed/cifs.json — Waze-compatible CIFS JSON feed
app.get('/api/feed/cifs.json', async (c) => {
  const list = await c.env.CONE_LOCATIONS.list({ prefix: 'cone:' });
  const cones = (await Promise.all(
    list.keys.map(async (key) => {
      const value = await c.env.CONE_LOCATIONS.get(key.name, 'json');
      return value;
    })
  )).filter(Boolean) as Array<{cone_id: string; lat: number; lng: number; label: string; placed_at: string}>;

  const now = new Date().toISOString();
  const incidents: Array<Record<string, string>> = [];

  if (cones.length >= 1) {
    const polyline = cones.map(c => `${c.lat.toFixed(6)} ${c.lng.toFixed(6)}`).join(' ');
    const street = cones[0].label || 'Construction Zone';
    const starttime = cones.reduce((earliest, c) => c.placed_at < earliest ? c.placed_at : earliest, cones[0].placed_at);

    incidents.push({
      id: 'smartcone-zone-1',
      type: 'ROAD_CLOSED',
      subtype: 'ROAD_CLOSED_CONSTRUCTION',
      polyline,
      street,
      direction: 'BOTH_DIRECTIONS',
      description: `Smart Cone monitored work zone - ${cones.length} cones deployed`,
      starttime,
      updatetime: now,
      creationtime: starttime,
    });
  }

  return c.json({ incidents });
});

// GET /api/firmware/version — latest available firmware version
app.get('/api/firmware/version', async (c) => {
  // Firmware version is stored in KV, updated by GitHub Actions
  const versionData = await c.env.CONE_LOCATIONS.get('firmware:latest', 'json');
  if (versionData) {
    return c.json(versionData);
  }
  // Default if not set yet
  return c.json({ version: '1.0.0', url: '' });
});

// POST /api/firmware/version — update available firmware version (called by GitHub Actions)
app.post('/api/firmware/version', async (c) => {
  const body = await c.req.json();
  const { version, url } = body;
  if (!version) {
    return c.json({ error: 'version required' }, 400);
  }
  await c.env.CONE_LOCATIONS.put('firmware:latest', JSON.stringify({ version, url, updated_at: new Date().toISOString() }));
  return c.json({ version, url }, 201);
});

app.get('/api/version', (c) => {
  return c.json({ version: '1.1.0' }); // x-release-please-version
});

app.get('/api/config', (c) => {
  return c.json({
    broker: c.env.MQTT_BROKER_WSS,
    username: c.env.MQTT_USER,
    password: c.env.MQTT_PASSWORD,
  })
})

// POST /api/events — persist an event
app.post('/api/events', async (c) => {
  const body = await c.req.json();
  const { cone_id, event, accel_g, tilt_deg, duration_s } = body;
  const timestamp = new Date().toISOString();
  const key = `event:${timestamp}:${cone_id || 'unknown'}`;
  const eventData = { cone_id, event, accel_g, tilt_deg, duration_s, timestamp };
  // Store with 7-day TTL
  await c.env.CONE_LOCATIONS.put(key, JSON.stringify(eventData), { expirationTtl: 604800 });
  return c.json(eventData, 201);
});

// GET /api/events — list recent events
app.get('/api/events', async (c) => {
  const limit = Number(c.req.query('limit') || '50');
  const list = await c.env.CONE_LOCATIONS.list({ prefix: 'event:', limit: 1000 });
  // Keys are sorted by timestamp (ISO format sorts correctly)
  const keys = list.keys.sort((a, b) => b.name.localeCompare(a.name)).slice(0, limit);
  const events = await Promise.all(
    keys.map(async (key) => {
      const value = await c.env.CONE_LOCATIONS.get(key.name, 'json');
      return value;
    })
  );
  return c.json(events.filter(Boolean));
});

export default app

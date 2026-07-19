## ADDED Requirements

### Requirement: Server fetches and caches LTA bus route sequences
The system SHALL fetch bus route sequences from LTA DataMall `BusRoutes` using the existing LTA API key and Effect-based client pattern. The full routes dataset MUST be cached server-side with a long TTL (at least 12 hours) so repeated client requests do not re-page the upstream API.

#### Scenario: Cold cache load
- **WHEN** the first request needs bus route data and the cache is empty
- **THEN** the server pages through LTA `BusRoutes` until all records are retrieved (or a safe page limit is hit) and stores the aggregated result in cache

#### Scenario: Warm cache hit
- **WHEN** a subsequent request needs bus route data within the cache TTL
- **THEN** the server returns data from cache without calling LTA again

#### Scenario: Missing LTA API key
- **WHEN** `LTA_API_KEY` is missing or a placeholder value
- **THEN** the bus routes effect fails with an authentication-style external API error consistent with other LTA clients

### Requirement: API returns geometry for a single bus service
The system SHALL expose `GET /api/bus-routes` that accepts a required `serviceNo` query parameter and returns ordered stop coordinates for that service, suitable for map polyline rendering. The response MUST include at least: service number, one or more directions, and for each direction an ordered list of stops with bus stop code, description (when available), latitude, and longitude.

#### Scenario: Valid service with known stops
- **WHEN** a client requests `/api/bus-routes?serviceNo=12` for a service present in cached routes
- **THEN** the API responds 200 with JSON containing that service’s direction sequences joined to stop coordinates from the bus stops dataset

#### Scenario: Missing service number
- **WHEN** a client requests `/api/bus-routes` without `serviceNo`
- **THEN** the API responds 400 with an error explaining that `serviceNo` is required

#### Scenario: Unknown service number
- **WHEN** a client requests a `serviceNo` that is not present in cached routes
- **THEN** the API responds 404 with an error indicating the service was not found

#### Scenario: Invalid service number format
- **WHEN** a client supplies a `serviceNo` that fails validation (empty, overly long, or disallowed characters)
- **THEN** the API responds 400 with a validation error

### Requirement: Optional stop context resolves relevant direction
When the client supplies an optional `stopId` (5-digit bus stop code), the system SHALL indicate which direction(s) include that stop and, when exactly one direction includes it, MAY mark that direction as preferred for UI highlighting. Stop coordinates for the route MUST still be derived by joining route stop codes to the bus stops catalog; stops missing from the catalog MUST be omitted from the coordinate sequence without failing the whole response.

#### Scenario: Stop appears on one direction
- **WHEN** `serviceNo` and `stopId` are provided and the stop appears in exactly one direction sequence
- **THEN** the response marks that direction as preferred (or equivalent) and includes the stop’s index in the sequence

#### Scenario: Stop appears on both directions
- **WHEN** `serviceNo` and `stopId` are provided and the stop appears in more than one direction
- **THEN** the response returns all matching directions without forcing a single preferred direction, and the client may present both

#### Scenario: Stop not on service
- **WHEN** `serviceNo` and `stopId` are provided but the stop is not on any direction of that service
- **THEN** the API still returns the full service route geometry and does not fail solely because the stop is absent from the sequence

### Requirement: Rate limiting and error handling match existing API routes
The bus-routes API route SHALL use the shared `handle` / rate-limit path used by other LTA-backed routes, and MUST not leak raw upstream error bodies to clients.

#### Scenario: Rate limit exceeded
- **WHEN** a client exceeds the configured per-IP rate limit for bus-routes
- **THEN** the API responds with the standard rate-limit error response used by other routes

#### Scenario: Upstream LTA failure
- **WHEN** LTA is unreachable or returns a non-success status during a cache miss
- **THEN** the API responds with a structured external API error (5xx family as appropriate) without exposing secrets or raw upstream payloads

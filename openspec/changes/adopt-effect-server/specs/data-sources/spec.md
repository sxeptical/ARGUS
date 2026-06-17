## ADDED Requirements

### Requirement: LTA DataMall client
The system SHALL provide an LTA client that fetches bus stops, bus arrivals, and traffic cameras from `https://datamall2.mytransport.sg/ltaodataservice`. The client SHALL be expressed as an `Effect` program whose success type is the corresponding schema-validated response and whose error channel is `ExternalApiError | TimeoutError | SchemaParseError`. The client SHALL use a 10 second timeout per request and SHALL attach the `LTA_API_KEY` as the `AccountKey` header.

#### Scenario: Successful bus-stops fetch
- **WHEN** the bus-stops client is invoked and the LTA endpoint returns a 200 with a valid JSON body
- **THEN** the Effect succeeds with a `BusStop[]` whose elements match the `BusStop` Schema

#### Scenario: 404 from LTA is treated as empty
- **WHEN** the LTA endpoint returns 404 for a resource
- **THEN** the Effect succeeds with an empty array (or empty result for that resource) and does not raise `ExternalApiError`

#### Scenario: LTA 429 surfaces as `ExternalApiError` with status 429
- **WHEN** the LTA endpoint returns HTTP 429
- **THEN** the Effect fails with `ExternalApiError` whose `status` field is `429`

#### Scenario: Timeout on slow LTA response
- **WHEN** the LTA endpoint does not respond within 10 seconds
- **THEN** the Effect fails with `TimeoutError`

### Requirement: Data.gov.sg weather client
The system SHALL provide a weather client that fetches 2-hour forecast, PSI, and air-temperature from `https://api.data.gov.sg/v1/environment` concurrently. The client SHALL be expressed as an `Effect` whose success type is `WeatherData` and whose error channel is `ExternalApiError | TimeoutError | SchemaParseError`. All three upstream requests SHALL run in parallel and SHALL share a 10 second timeout. The client SHALL derive `psiStatus` from the national PSI reading using the existing thresholds (≤50 Good, ≤100 Moderate, otherwise Unhealthy; null → Unknown).

#### Scenario: All three sources succeed
- **WHEN** all three Data.gov.sg endpoints return 200 with valid JSON
- **THEN** the Effect succeeds with a `WeatherData` whose `temperature` is the rounded mean of the air-temperature readings, `psi` is the national 24-hourly PSI, and `lastUpdated` is the most recent ISO timestamp across the three responses

#### Scenario: One of three sources fails
- **WHEN** at least one of the three Data.gov.sg endpoints returns non-200 or invalid JSON
- **THEN** the Effect fails with the corresponding `ExternalApiError` or `SchemaParseError` (no partial success)

### Requirement: Aviationstack flight client
The system SHALL provide an Aviationstack client that fetches live flights for Singapore airports from `https://api.aviationstack.com/v1/flights`. The client SHALL issue four parallel queries filtered by `dep_icao`/`arr_icao` for WSSS and WSSL, merge the results by `icao24` keeping the entry with the most recent `lastContact`, and return `FlightState[]`. The client SHALL use a 6 second timeout per query. The error channel SHALL be `ExternalApiError | TimeoutError | SchemaParseError`. Aviationstack errors of HTTP 200 with `payload.error` present SHALL be reported as `ExternalApiError` with status 502.

#### Scenario: All four queries return data
- **WHEN** the four Aviationstack queries return 200 with `data` arrays
- **THEN** the Effect succeeds with a deduplicated `FlightState[]` of at most 120 entries sorted by descending velocity

#### Scenario: Aviationstack returns HTTP 200 with `payload.error`
- **WHEN** the upstream responds with 200 but the body has a non-empty `error` field
- **THEN** the Effect fails with `ExternalApiError` whose `status` is 502 and whose message includes the upstream `error.code` and `error.info`

#### Scenario: One of four queries fails
- **WHEN** at least one of the four queries fails with a 5xx response
- **THEN** the Effect still succeeds if at least one query returned data, and fails with `ExternalApiError` only if all four queries fail

### Requirement: OpenSky flight client
The system SHALL provide an OpenSky client that fetches live states for the Singapore bounding box from `https://opensky-network.org/api/states/all`. The client SHALL use a 6 second timeout. The success type SHALL be `FlightState[]` and the error channel SHALL be `ExternalApiError | TimeoutError | SchemaParseError`. 404 responses SHALL be treated as an empty result, not an error.

#### Scenario: OpenSky returns states
- **WHEN** the OpenSky endpoint returns 200 with a `states` array
- **THEN** the Effect succeeds with a `FlightState[]` filtered to entries that are airborne and have finite lat/lon

#### Scenario: OpenSky returns 404
- **WHEN** the OpenSky endpoint returns 404
- **THEN** the Effect succeeds with an empty array

### Requirement: Flight fallback chain
The system SHALL compose Aviationstack, OpenSky, and a last-good snapshot into a single `getFlights` Effect. The system SHALL try Aviationstack first; if it produces an empty list, the system SHALL try OpenSky; if both are empty, the system SHALL succeed with the cached last-good snapshot if one is available and younger than 10 minutes, otherwise with an empty array. When the chosen provider returns a non-empty result, the system SHALL publish it to the last-good snapshot cache with a 10 minute TTL.

#### Scenario: Aviationstack returns data
- **WHEN** `getFlights` is invoked and Aviationstack returns a non-empty `FlightState[]`
- **THEN** the Effect succeeds with that result and the result is published to the last-good snapshot cache

#### Scenario: Aviationstack empty, OpenSky returns data
- **WHEN** `getFlights` is invoked and Aviationstack returns an empty list and OpenSky returns a non-empty list
- **THEN** the Effect succeeds with the OpenSky result and that result is published to the last-good snapshot cache

#### Scenario: Both providers empty, last-good snapshot present
- **WHEN** `getFlights` is invoked and both providers return empty lists, and a last-good snapshot exists and is younger than 10 minutes
- **THEN** the Effect succeeds with the last-good snapshot

#### Scenario: Both providers empty, no last-good snapshot
- **WHEN** `getFlights` is invoked and both providers return empty lists, and no last-good snapshot exists
- **THEN** the Effect succeeds with an empty array

### Requirement: RSS news client
The system SHALL provide a news client that fetches RSS feeds from The Straits Times and CNA, parses `<item>` elements into `NewsItem` records, deduplicates by URL, sorts by descending `publishedAt`, and returns the first 20. The success type SHALL be `NewsItem[]` and the error channel SHALL be `ExternalApiError | TimeoutError | SchemaParseError`. Per-source failures SHALL be tolerated: a feed that errors out SHALL contribute an empty list to the merge. If the merged result is empty, the system SHALL succeed with a single placeholder `NewsItem` whose title is "News feeds are currently unavailable". Per-feed responses SHALL be rejected if the response body exceeds 512 KB.

#### Scenario: Both feeds succeed
- **WHEN** both RSS feeds return 200 with valid XML under 512 KB
- **THEN** the Effect succeeds with up to 20 `NewsItem` records sorted by descending `publishedAt`

#### Scenario: One feed fails
- **WHEN** one RSS feed returns non-200 or invalid XML and the other returns valid XML
- **THEN** the Effect succeeds with the entries from the successful feed

#### Scenario: Both feeds fail
- **WHEN** both RSS feeds return non-200 or invalid XML
- **THEN** the Effect succeeds with a single placeholder `NewsItem` whose title is "News feeds are currently unavailable"

#### Scenario: Feed body exceeds 512 KB
- **WHEN** an RSS feed responds with a `Content-Length` greater than 512 KB or whose body length exceeds 512 KB
- **THEN** the Effect treats that feed as a failure and contributes no items from it

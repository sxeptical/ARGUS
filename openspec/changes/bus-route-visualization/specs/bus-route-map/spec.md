## ADDED Requirements

### Requirement: User can show a bus service route from a selected stop
When a bus stop is selected and live arrivals list one or more services, the user SHALL be able to select a service in the bus panel to load and display that service’s route on the map. Selecting a service MUST request route data for that service (with the selected stop as context when available).

#### Scenario: Show route from arrivals list
- **WHEN** the user has a selected bus stop with arrivals and activates “show route” (or equivalent) on a service row
- **THEN** the client fetches route geometry for that service and renders it on the map

#### Scenario: Loading state while route fetches
- **WHEN** route data is being fetched for the selected service
- **THEN** the UI indicates loading for that route action and does not leave a stale route from a previous service visible as if it were current

#### Scenario: Route fetch failure
- **WHEN** the bus-routes API returns an error or the request fails
- **THEN** the UI shows a concise error near the bus panel service context and does not draw an incomplete route as success

### Requirement: Map draws one active bus route polyline
The map SHALL render at most one active bus route overlay at a time as a stop-to-stop polyline using the ordered coordinates from the API. The selected bus stop MUST remain visually distinguishable while a route is shown. Drawing a new service route MUST replace any previous bus route overlay.

#### Scenario: Route polyline visible
- **WHEN** valid route coordinates are available for the active service
- **THEN** the map draws a continuous polyline through the ordered stop coordinates for the preferred or selected direction

#### Scenario: Switching services replaces overlay
- **WHEN** the user selects a different service while a route is already shown
- **THEN** the previous bus route overlay is removed and replaced by the newly selected service route

#### Scenario: Clear route overlay
- **WHEN** the user clears the route, deselects the bus stop, or otherwise dismisses the active bus route
- **THEN** the bus route polyline is removed from the map

### Requirement: Direction handling for two-way and loop services
If the API returns multiple directions, the client SHALL either auto-select a preferred direction when the API provides one, or allow the user to choose among returned directions. The map MUST draw only the currently selected direction’s coordinates.

#### Scenario: Preferred direction auto-selected
- **WHEN** the API marks a preferred direction because the selected stop appears on only one direction
- **THEN** the client draws that direction without requiring an extra user choice

#### Scenario: Multiple directions without preference
- **WHEN** multiple directions are returned and none is preferred
- **THEN** the client defaults to a stable choice (e.g. direction 1) and offers a control to switch direction

### Requirement: Optional remaining-path emphasis from selected stop
When the selected stop’s index is known on the active direction, the client MAY emphasize the remaining path from that stop toward the end of the sequence (e.g. full route faint, remaining segment bold). If the stop index is unknown, the client MUST still show the full direction polyline.

#### Scenario: Stop index known
- **WHEN** the active direction includes the selected stop index
- **THEN** the map may render remaining-path emphasis from that index while still showing full-route context

#### Scenario: Stop index unknown
- **WHEN** the selected stop is not found on the active direction sequence
- **THEN** the map shows the full direction polyline without remaining-path emphasis

### Requirement: Bus route overlay coexists with other map layers
The bus route overlay MUST not disable MRT, flights, or camera layers. Toggling the bus-stops sensor layer MUST not leave an orphaned bus route polyline if stops are hidden; either the route remains independently visible or it is cleared consistently with product choice documented in design (default: route remains until explicitly cleared or stop/service context ends).

#### Scenario: MRT and bus route both visible
- **WHEN** an MRT route highlight and a bus route overlay are both active
- **THEN** both can render on the map without one clearing the other

#### Scenario: Bus stops layer toggled off
- **WHEN** the user hides the bus-stops sensor layer while a bus route is active
- **THEN** the bus route overlay remains until the user clears the route or changes stop/service context

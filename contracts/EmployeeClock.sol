// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title EmployeeClock
/// @notice On-chain clock-in / clock-out with GPS geofence validation.
///
/// @dev Deliberate design choices (per project decisions, 2026-07-11):
///   1. Overtime is NOT tracked on-chain. It's calculated and reconciled
///      against the roster off-chain, in the ClockIn Manager app.
///      clockOut() no longer accepts an overtimeMinutes parameter —
///      there is nothing for a worker to self-report and no trust
///      assumption baked into the contract anymore.
///   2. The 9-hour "one shift per rolling window" cooldown is enforced
///      in the app (see src/utils/shiftCooldown.js), NOT here. This
///      contract does not rate-limit clockIn() beyond requiring the
///      caller isn't already clocked in. A direct contract call bypasses
///      the app's cooldown UI — that's an accepted tradeoff for now.
///   3. Geofence is a single fixed worksite. If you add more sites later,
///      this will need an owner-managed list of (lat, lng, radius)
///      instead of the hardcoded constants below.
contract EmployeeClock {
    struct ClockEvent {
        uint40 timestamp;  // seconds since epoch (fits until year ~36812)
        int32 latitude;    // degrees, scaled by 1e6
        int32 longitude;   // degrees, scaled by 1e6
    }

    // ---- Fixed worksite geofence ----
    // Reference point: -33.932101, 151.165226 (scaled by 1e6)
    int256 public constant SITE_LAT = -33932101;
    int256 public constant SITE_LNG = 151165226;

    // Meters-per-degree at this latitude. Longitude degrees shrink by
    // cos(latitude); latitude degrees are ~constant everywhere on Earth.
    uint256 public constant METERS_PER_DEGREE_LAT = 111320;
    uint256 public constant METERS_PER_DEGREE_LNG = 92362; // 111320 * cos(33.932101°)

    uint256 public constant GEOFENCE_RADIUS_METERS = 500;
    uint256 public constant GEOFENCE_RADIUS_SQUARED =
        GEOFENCE_RADIUS_METERS * GEOFENCE_RADIUS_METERS;

    mapping(address => mapping(uint256 => ClockEvent)) public employeeRecords;
    mapping(address => uint256) public employeeRecordCount;
    mapping(address => bool) public isClockedIn;

    event ClockIn(address indexed employee, uint256 timestamp, int256 latitude, int256 longitude);
    event ClockOut(address indexed employee, uint256 timestamp, int256 latitude, int256 longitude);

    function clockIn(int256 latitude, int256 longitude) public {
        require(!isClockedIn[msg.sender], "Already clocked in");
        _requireWithinGeofence(latitude, longitude);

        uint256 recordIndex = employeeRecordCount[msg.sender];
        employeeRecords[msg.sender][recordIndex] = ClockEvent(
            uint40(block.timestamp),
            int32(latitude),
            int32(longitude)
        );
        employeeRecordCount[msg.sender]++;
        isClockedIn[msg.sender] = true;

        emit ClockIn(msg.sender, block.timestamp, latitude, longitude);
    }

    function clockOut(int256 latitude, int256 longitude) public {
        require(isClockedIn[msg.sender], "Not clocked in");
        _requireWithinGeofence(latitude, longitude);

        uint256 recordIndex = employeeRecordCount[msg.sender];
        employeeRecords[msg.sender][recordIndex] = ClockEvent(
            uint40(block.timestamp),
            int32(latitude),
            int32(longitude)
        );
        employeeRecordCount[msg.sender]++;
        isClockedIn[msg.sender] = false;

        emit ClockOut(msg.sender, block.timestamp, latitude, longitude);
    }

    /// @notice Returns every clock event recorded for `employee`.
    function getClockRecords(address employee) public view returns (ClockEvent[] memory records) {
        uint256 count = employeeRecordCount[employee];
        records = new ClockEvent[](count);
        for (uint256 i = 0; i < count; i++) {
            records[i] = employeeRecords[employee][i];
        }
    }

    /// @dev Reverts unless (latitude, longitude) is within
    ///      GEOFENCE_RADIUS_METERS of the fixed worksite. Uses squared
    ///      distance to avoid needing sqrt on-chain. Flat-earth
    ///      (equirectangular) approximation — accurate to well under
    ///      a meter at this radius, which is more than good enough
    ///      for a 500m geofence.
    function _requireWithinGeofence(int256 latitude, int256 longitude) internal pure {
        require(latitude >= -90e6 && latitude <= 90e6, "Invalid latitude");
        require(longitude >= -180e6 && longitude <= 180e6, "Invalid longitude");

        int256 dLatMeters = ((latitude - SITE_LAT) * int256(METERS_PER_DEGREE_LAT)) / 1e6;
        int256 dLngMeters = ((longitude - SITE_LNG) * int256(METERS_PER_DEGREE_LNG)) / 1e6;
        uint256 distanceSquared = uint256(dLatMeters * dLatMeters + dLngMeters * dLngMeters);

        require(distanceSquared <= GEOFENCE_RADIUS_SQUARED, "Outside geofence radius");
    }
}

# DropSim

DropSim is a browser sandbox for the flight behavior of a small object after it is released from a parent aircraft. It is meant for generic research, robotics, search and recovery, cargo delivery, and autonomous-flight studies.

It does not model weapon targeting, payload attack, or explosive guidance.

Public usage, and the reference for later development, is [docs/usage.md](docs/usage.md).

## Run

```bash
pnpm install
pnpm run dev
pnpm test
pnpm run typecheck
pnpm run build
```

## Reference for development

[docs/usage.md](docs/usage.md) describes what a person can do in the app and what the results mean. Further work follows that file.

- A change that adds, removes, or renames a visible behavior updates `docs/usage.md` in the same change.
- If the app and that file disagree, fix them together. Do not leave a second, quieter description of the same behavior in this README.
- Numbers stay labeled as physically modeled, user assumption, estimate, calculated, or example profile. Do not invent a radio range, sensor specification, or component value.

## Code map

`src/physics` integrator and forces  
`src/sensors` GNSS, IMU, barometer, magnetometer, airspeed, altimeter  
`src/communications` loss, latency, retries  
`src/estimation` raw, complementary, and linear Kalman filters  
`src/control` optional landing-area guidance  
`src/simulation` scenario, drop plan, release search, comparison, Monte Carlo  
`src/integrations` site origin, Open-Meteo, GPX, KML, MAVLink, NMEA, MCAP, serial, MQTT  
`src/catalog` component schema and JSON/CSV import  
`src/workers` Monte Carlo worker  
`docs/usage.md` public usage reference

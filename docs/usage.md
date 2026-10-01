# DropSim usage

This is the public description of how to use DropSim. It is also the reference for later development. If a change adds, removes, or renames something a person can do in the app, update this file in the same change. If this file and the app disagree, the app is what a person sees today and this file is what the next change must bring back into agreement.

DropSim is a browser sandbox for a small object released from a parent aircraft. It is for research, robotics, search and recovery, cargo delivery, and autonomous-flight studies. It models wind, mass, sensors, telemetry, and an optional landing correction. It does not model weapon targeting, payload attack, or explosive guidance.

## Run it

```bash
pnpm install
pnpm run dev
pnpm test
pnpm run typecheck
pnpm run build
```

`pnpm run dev` opens the sandbox in a browser. The header clocks (physics, IMU, GNSS, telemetry, UI) are independent. The picture can refresh at a different rate from the motion.

## A first drop

The opening scenario is a sphere released from 300 m, flying north at 28 m/s, with an 8 m/s wind blowing east. The landing area is 180 m north of the release and 20 m across. That drop misses. The right-hand **Now** panel says so, with the miss in metres.

To place your own drop:

1. On **Scenario**, use **Drop plan**.
2. Set the carrier east, north, and altitude. East and north are metres from the local origin. Altitude is height above the ground.
3. Set the landing area: target east, target north, and radius. A landing inside the radius is a success. You can also drag the circle in the 3D view or on the ground-track map. The pale dot is the center the suggestion aims at.
4. Choose what you drop: **Sphere**, **Compact glider**, **Small glider**, or **Efficient glider**.
5. Click **Suggest release speed** to keep the carrier where it is and search speed and heading. Or click **Suggest drop location** when the plane is already heading toward the destination. That search moves the release until the impact estimate is on the center of the landing area. The heading at release points at the destination.
6. Click **Use and run** when that release is predicted to land inside the area. Click **Use closest and run** when every searched release still misses. The run applies the suggested speed, heading, and, for a drop location, the suggested east and north. The flight is given enough time to reach the ground.
7. Read **Now**. **Success** means the impact is inside the radius. **Miss** means it is not. The same panel lists east, north, miss, time, and impact speed.

The map marks the carrier and the target ring. North is up and east is right.

## What you are looking at

The left sidebar is the scenario. The center is the flight. The right sidebar is the result.

Header:

- **Run** / **Run again** integrates the current scenario.
- **Compare** flies the saved comparison rows and lists their misses side by side.
- **Export JSON** saves the scenario, including the random seed.
- **Export CSV** saves the playback samples.
- **Share** saves the same samples as GPX, KML, a MAVLink `.tlog`, NMEA, or a Foxglove MCAP file.

Camera chips are **Orbit**, **Top**, **Side**, **Follow**, and **Free**. **Arrow scale** changes how long the force and velocity arrows are drawn. The numbers in the legend stay in newtons and metres per second. **Model scale** has two settings. **Visible** draws the object large enough to see (about 8 m across on screen). **True** draws the physical size. The parent aircraft is a release marker on a straight path, not a measured airframe.

On **Now**, **Vectors** can show or hide wind, object velocity, ground velocity, relative air, gravity, drag, lift, correction, and link. **Show all** and **Hide all** set the whole list. Hiding wind also hides the wind marks in the view. Hiding link hides the line back to the carrier and the nominal range ring.

Charts under the view are altitude, speed, error, and the link model. Playback scrubs stored samples. It does not re-integrate.

## Objects you can drop

**Sphere** is the default. It has drag and no lift. Release speed and heading are what move the impact. The built-in drag coefficient is 0.47, a textbook subcritical sphere value, not a measurement of your object. Mass starts at 1.2 kg and diameter at 0.22 m.

The three gliders are passive. They do not steer. Each one is a starting assumption you can edit on **Object** after you select it.

| Body | Mass | Drag coefficient | Lift-to-drag | Wing area |
| --- | --- | --- | --- | --- |
| Compact glider | 0.8 kg | 0.12 | 4 | 0.2 m² |
| Small glider | 1.2 kg | 0.08 | 8 | 0.45 m² |
| Efficient glider | 1.0 kg | 0.05 | 14 | 0.6 m² |

Lift-to-drag is the range control. In still air, a glider that can hold its slope travels about altitude times lift-to-drag before it reaches the ground. From 300 m, a ratio of 8 is on the order of 2 km. That can reach a target a sphere cannot reach from the same height, and it can fly past a target that is close. Release speed aims the glide. It does not make the slope steeper.

Mass and wing area change whether the wing can hold that slope, and how long the wind has to push the object. A heavier body, or a smaller wing, drifts less. They are not a second guidance loop.

**Object** also has a ballistic model, a simple glider, and custom coefficients. Choosing the simple glider turns lift-to-drag on and turns steering off. Custom coefficients are where Cl and the pitching-moment coefficient are entered. Aspect ratio is stored with a scenario and is not used by the flight model, so it is not a control in the form.

Presets on **Scenario** are complete scenario replacements, separate from the drop-plan bodies. They include a calm sphere, a passive small glider, high wind, rain, poor and tight GNSS assumptions, and example poor and good telemetry profiles.

## Suggest release speed

The search clones the scenario, turns steering off, and tries a grid of speeds and headings around the bearing from the carrier to the target. It uses the wind saved in the scenario, including turbulence when that is non-zero. The same seed repeats the same suggestion.

The note is one of three kinds:

- A speed and heading predicted to land inside the radius.
- The closest passive drop, and whether it falls short or flies past. For a glider, the note includes height times lift-to-drag as a still-air estimate. Wind and a wing that cannot hold the slope move the real landing off that estimate.
- No landing, when the carrier is already on the ground or the body is still airborne at the end of the search.

Applying the suggestion also turns **Inherit release velocity** on, so the object starts with the carrier’s speed and heading.

## Suggest drop location

Use this when the plane is flying toward the landing area and you need the release point for the object you already selected.

The inbound direction starts as the current release heading. The search places the carrier on that approach, points the heading at the destination, and flies the object with steering off. Each pass moves the release by the whole miss, so the next estimate is closer to the center of the ring, not merely somewhere inside it. Wind drift moves the drop upwind of that center. It tries the current speed first. Another speed is suggested only when the current speed cannot put the estimate on the center.

The note lists the suggested variables for these circumstances: east, north, altitude, speed, heading, and the object’s mass, drag coefficient, and, for a glider, lift-to-drag and wing area. Those object numbers are the ones in the scenario. The search does not swap the object.

**Use and run** moves the carrier to that east and north, sets the speed and heading, and runs. The map’s carrier mark follows.

## Suggestion limits

Under **Suggestion limits** you set the slowest and fastest release the search may use. It will not suggest a speed outside that range, even if a speed outside it would land closer to the center.

Mass stays at the value on the object unless **Suggestion may change mass** is on. When it is on, the search may pick a mass between the lightest and heaviest bounds to put the estimate on the center, and **Use and run** applies that mass. If you enter the high bound below the low bound, the search uses the two numbers as a range with the smaller one first.

## Moving the aim circle

The destination is a circle on the ground. Its center is the point the drop suggestion tries to hit. Drag the white center or the ring in the 3D view, or the ring on the east-north map. The rest of the view still orbits. Letting go of the pointer always releases the circle, including over a hill. While you drag, the circle stays at the height where you picked it up, then sits on the terrain when you release. Run again to see the new miss.

## Environment

**Environment** sets the wind and the air.

Wind direction is the direction the air moves toward. 0° is toward north. 90° is toward east. A constant profile uses one speed. An altitude profile uses a power law about the reference height. The shear exponent is an assumption. Turbulence is smooth random variation with the standard deviation you enter. It is not a certified Dryden spectrum. Gusts are a separate switch.

Density is either a surface ideal-gas value or the ISA troposphere up to 11 km. Temperature, pressure, and humidity feed the ideal-gas value. Gravity is a positive number; the force is downward.

Rain changes visibility and, through the factors you set, sensor noise and dropout. The rain-drag factor starts at 0, so rain does not move the object until you set that factor.

**Integrations** sets the map origin: latitude, longitude, and the elevation of the local ground above mean sea level. East and north metres are a flat offset from that point, suitable for a flight of a few kilometres. **Load Open-Meteo forecast** fills wind, temperature, humidity, pressure, precipitation, and elevation from the [Open-Meteo](https://open-meteo.com/) forecast API. Open-Meteo reports the direction the wind comes from; DropSim stores the direction it blows toward. The forecast is attributed to Open-Meteo, CC BY 4.0, and the scenario keeps that note.

The same latitude and longitude load a 3D terrain surface under the flight. Heights come from the [Open-Meteo elevation API](https://open-meteo.com/en/docs/elevation-api), which uses the Copernicus DEM GLO-90 at 90 m resolution. The height at the origin is drawn as the drop surface (0 m). Surrounding ground is the elevation difference from that point, in true metres. The flight model still lands on the flat local ground; the terrain is the picture of the site, not a change to the impact calculation.

What you see by default is the **3D terrain**: the ground is raised and lowered by those heights, colored from low to high, with a grid that follows the surface. It is not a street map. **Surface** can switch that picture. **3D terrain** is the relief. **Map** lays an [OpenFreeMap](https://openfreemap.org/) street map on the same hills. **Google** lays a Google hybrid image on them when you paste a Maps Static API key. The key stays in this browser session and is not saved. Google bills use of that key. Until a key is present, the public street map is used for that option only. The default stays the 3D terrain.

## Trials

**Trials** repeats the drop with small changes to wind, mass, drag, and release. Choose 10, 100, 1 000, or 10 000 runs, then **Run trials**.

On the map, each yellow dot is one impact. The ring is the landing area. The green line is the single playback in the 3D view, not an average of the trials. A white cross is the mean impact.

“Within” numbers are distance from the ring center, not the gap between dots. A tight cloud far from the ring means the trials agree with each other, and they agree on missing. East and north spread describe the width of the cloud. **Export landing CSV** saves the impacts.

## Sensors, the link, and corrections

A plane drop leaves corrections off. The carrier, the release, and the shape decide the impact.

**Sensors** are noisy, delayed, and sampled. They are not the true state. The estimator can be perfect state, raw sensors, a complementary filter, or a Kalman filter. The Kalman filter predicts with gravity only, so drag appears as estimation error on purpose. The IMU is in the East-North-Up frame.

**Link** is an example radio profile: frequency, rate, packet size, interval, latency, jitter, nominal range, retries, and a loss curve. Built-in profiles are examples. Nominal range is not a guaranteed link. The loss curve is drawn from the numbers in the profile.

**Control** is an optional steering loop after release. With corrections off, the tab only explains that and offers the switch. Turning corrections on reveals the actuator (none, a generic acceleration, or banking the lift), the guidance law (trajectory, heading, velocity, or return to an abort point), and the gains and limits. Those commands depend on the telemetry that actually arrives. This is a delivery or recovery aim point, not a seeker.

**Catalog** lists components. The shipped entries have names and blank specifications. Empty fields are not applied. Import a JSON or CSV datasheet you are allowed to use, or type the values yourself.

## Files and live output

From **Share** in the header, or from **Integrations**:

- GPX and KML open in Google Earth and QGIS.
- The MAVLink file is a QGroundControl `.tlog`. Its autopilot type is invalid, so the file is not claiming to be PX4.
- NMEA is GGA, RMC, and VTG sentences.
- MCAP is a Foxglove LocationFix channel.

In browsers that expose Web Serial (Chrome and Edge), **Send NMEA to a serial port** writes that NMEA log to a port you select.

MQTT publishes JSON state about five times a second. The broker URL must be `ws://` or `wss://`. The browser cannot open raw MQTT TCP. The password stays in the session and is not saved in the scenario file.

**Scenario** can save a named copy in this browser, import a scenario JSON file, or remove a saved copy.

## Coordinates

Physics uses a local East-North-Up frame:

- X is east
- Y is north
- Z is up

Headings are navigation bearings: 0° is north and 90° is east.

The 3D view uses Three.js Y-up. The only conversion is three X = east, three Y = up, three Z = north. Raw Three.js coordinates are not physics coordinates.

Drag magnitude is `0.5 * ρ * Cd * A * v_relative²`, opposite the wind-relative velocity `v_object − v_wind`. Wind does not move the object unless drag or lift is non-zero.

## Labels on numbers

Every important number is labeled in the form:

- **Physically modeled** for relations the integrator computes, such as gravity and quadratic drag.
- **User assumption** for values you typed or accepted, including mass, wind, and sensor noise.
- **Estimate** for a textbook or stand-in value, such as the sphere drag coefficient 0.47.
- **Calculated** for a quantity derived from other fields, such as density from mass and volume.
- **Example profile** for a built-in radio sketch.

The in-app **Notes** tab repeats this split and lists what is not modeled: CFD, real radio fading, a body-frame IMU, and an extended Kalman filter.

## For later development

Treat this file as the product reference.

- Describe a new visible control, result, export, or preset here in the same change that adds it.
- Remove or rewrite a section when the app no longer does what it says.
- Keep assumption, estimate, and example distinct. Do not write a radio range, sensor specification, or component number that the scenario or catalog does not contain.
- A passive drop stays passive unless the person turns corrections on. Glider range stays tied to lift-to-drag, mass, and wing area as described above.
- **Suggest drop location** keeps the selected object and the current wind. It moves the release point until the impact estimate is on the center of the landing area, and it aims the heading at the destination. It changes speed only when the current speed cannot put that estimate on the center, and only inside the speed limits. It changes mass only when mass variation is on, and only inside the mass limits.
- The aim circle can be dragged in the 3D view and on the ground-track map. Dragging moves `control.target` east and north. The radius is unchanged.
- Terrain in the 3D view is Copernicus DEM GLO-90 via Open-Meteo, relative to the site origin. It does not change the landing calculation. The Map surface is OpenFreeMap (OpenStreetMap). Google hybrid imagery is used only when the person supplies a Maps Static API key, and that key is not stored in the scenario.
- Physics stays East-North-Up, with the Three.js conversion stated here. The physics step stays independent of the display frame rate.
- Tests that lock a behavior described here should keep that behavior, or this file changes with the test.

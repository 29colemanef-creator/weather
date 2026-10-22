const form = document.querySelector("#place-search-form");
const searchInput = document.querySelector("#place-query");
const submitButton = document.querySelector("#submit-button");
const message = document.querySelector("#message");
const placeResults = document.querySelector("#place-results");
const locationHeading = document.querySelector("#location-heading");
const locationMeta = document.querySelector("#location-meta");
const currentWeather = document.querySelector("#current-weather");
const forecastHeading = document.querySelector("#forecast-heading");
const forecastPeriods = document.querySelector("#forecast-periods");
const forecastSource = document.querySelector("#forecast-source");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearForecast();
  placeResults.replaceChildren();
  placeResults.hidden = true;
  setMessage("Searching places around the world...");
  submitButton.disabled = true;

  const parameters = new URLSearchParams({ q: searchInput.value.trim() });

  try {
    const response = await fetch(`/api/places?${parameters}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Places could not be searched. Please try again.");
    }

    if (!Array.isArray(data.places) || data.places.length === 0) {
      setMessage("No matching places found. Try another city, country, or region.");
      return;
    }

    for (const place of data.places) {
      placeResults.append(createPlaceOption(place));
    }
    placeResults.hidden = false;
    setMessage(`Choose a place to see its forecast. ${data.places.length} matches found.`);
  } catch (error) {
    setMessage(error instanceof Error
      ? error.message
      : "Places could not be searched. Please try again.", true);
  } finally {
    submitButton.disabled = false;
  }
});

function createPlaceOption(place) {
  const option = document.createElement("button");
  option.type = "button";
  option.className = "place-option";
  option.setAttribute("aria-label", `Get forecast for ${formatPlaceName(place)}`);

  const name = document.createElement("span");
  name.className = "place-name";
  name.textContent = place.name || "Unknown place";

  const details = document.createElement("span");
  details.className = "place-details";
  const regions = [place.region, place.country, place.continent].filter(Boolean);
  const timezone = place.timezone ? `Time zone: ${place.timezone}` : "";
  details.textContent = [regions.join(" · "), timezone].filter(Boolean).join("  |  ");

  option.append(name, details);
  option.addEventListener("click", () => loadForecast(place));
  return option;
}

async function loadForecast(place) {
  placeResults.hidden = true;
  placeResults.replaceChildren();
  clearForecast();
  locationHeading.textContent = `Forecast for ${formatPlaceName(place)}`;
  locationHeading.hidden = false;
  const locationDetails = [place.region, place.country, place.continent, place.timezone]
    .filter(Boolean);
  locationMeta.textContent = locationDetails.join(" · ");
  locationMeta.hidden = locationDetails.length === 0;
  setMessage("Loading local weather...");
  submitButton.disabled = true;

  const parameters = new URLSearchParams({
    latitude: place.latitude,
    longitude: place.longitude,
  });

  try {
    const response = await fetch(`/api/forecast?${parameters}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "The forecast could not be retrieved.");
    }
    renderForecast(data);
    message.textContent = "";
    message.removeAttribute("role");
  } catch (error) {
    setMessage(error instanceof Error
      ? error.message
      : "The forecast is unavailable. Please try again.", true);
  } finally {
    submitButton.disabled = false;
  }
}

function renderForecast(data) {
  const current = data.current;
  const daily = data.daily;
  const units = data.units || {};
  if (!current || !daily || !Array.isArray(daily.time)) {
    throw new Error("The weather service returned incomplete forecast data.");
  }

  currentWeather.append(createCurrentWeather(current, units, data.timezone));
  currentWeather.hidden = false;

  const dayCount = daily.time.length;
  for (let index = 0; index < dayCount; index += 1) {
    forecastPeriods.append(createForecastCard(daily, index, units));
  }
  forecastPeriods.hidden = forecastPeriods.childElementCount === 0;
  forecastHeading.hidden = forecastPeriods.hidden;
  forecastSource.hidden = false;
}

function createCurrentWeather(current, units, timezone) {
  const card = document.createElement("div");
  card.className = "current-summary";

  const condition = document.createElement("p");
  condition.className = "current-condition";
  condition.textContent = describeWeather(current.weather_code);

  const temperature = document.createElement("p");
  temperature.className = "current-temperature";
  temperature.textContent = formatTemperature(current.temperature_2m, units.temperature);

  const time = document.createElement("p");
  time.className = "current-time";
  time.textContent = [formatLocalTime(current.time), timezone].filter(Boolean).join(" · ");
  card.append(condition, temperature, time);

  const metrics = document.createElement("div");
  metrics.className = "current-metrics";
  metrics.append(
    createMetric("Feels like", formatTemperature(current.apparent_temperature, units.temperature)),
    createMetric("Humidity", formatValue(current.relative_humidity_2m, "%")),
    createMetric(
      "Wind",
      [formatMeasurement(current.wind_speed_10m, units.windSpeed), formatWindDirection(current.wind_direction_10m)]
        .filter(Boolean)
        .join(" "),
    ),
    createMetric("Precipitation", formatMeasurement(current.precipitation, "mm")),
  );
  card.append(metrics);
  return card;
}

function createMetric(label, value) {
  const metric = document.createElement("div");
  metric.className = "current-metric";
  const labelElement = document.createElement("span");
  labelElement.className = "metric-label";
  labelElement.textContent = label;
  const valueElement = document.createElement("span");
  valueElement.className = "metric-value";
  valueElement.textContent = value || "—";
  metric.append(labelElement, valueElement);
  return metric;
}

function createForecastCard(daily, index, units) {
  const card = document.createElement("article");
  card.className = "forecast-card";

  const heading = document.createElement("h3");
  heading.textContent = formatForecastDay(daily.time[index]);

  const temperature = document.createElement("p");
  temperature.className = "temperature";
  temperature.textContent = formatTemperatureRange(
    daily.temperature_2m_max?.[index],
    daily.temperature_2m_min?.[index],
    units.temperature,
  );

  const conditions = document.createElement("p");
  conditions.textContent = describeWeather(daily.weather_code?.[index]);

  const rainChance = document.createElement("p");
  rainChance.className = "wind";
  const chance = daily.precipitation_probability_max?.[index];
  rainChance.textContent = chance == null
    ? " "
    : `Rain chance: ${formatValue(chance, units.precipitationProbability || "%")}`;

  card.append(heading, temperature, conditions, rainChance);
  return card;
}

function clearForecast() {
  locationHeading.hidden = true;
  locationMeta.hidden = true;
  currentWeather.replaceChildren();
  currentWeather.hidden = true;
  forecastPeriods.replaceChildren();
  forecastPeriods.hidden = true;
  forecastHeading.hidden = true;
  forecastSource.hidden = true;
}

function setMessage(text, isError = false) {
  message.textContent = text;
  if (isError) {
    message.setAttribute("role", "alert");
  } else {
    message.removeAttribute("role");
  }
}

function formatPlaceName(place) {
  return [place.name, place.country].filter(Boolean).join(", ") || "this location";
}

function formatTemperature(value, unit = "°C") {
  return value == null ? "—" : `${Math.round(value)}${unit}`;
}

function formatTemperatureRange(high, low, unit = "°C") {
  if (high == null && low == null) {
    return "—";
  }
  return `${high == null ? "—" : `${Math.round(high)}${unit}`} / ${low == null ? "—" : `${Math.round(low)}${unit}`}`;
}

function formatValue(value, unit = "") {
  return value == null ? "" : `${value}${unit}`;
}

function formatMeasurement(value, unit = "") {
  return value == null ? "" : `${value}${unit ? ` ${unit}` : ""}`;
}

function formatLocalTime(value) {
  return typeof value === "string" ? value.replace("T", " ") : "";
}

function formatForecastDay(value) {
  if (typeof value !== "string") {
    return "Forecast";
  }
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatWindDirection(degrees) {
  if (degrees == null) {
    return "";
  }
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return directions[Math.round(degrees / 45) % directions.length];
}

function describeWeather(code) {
  const descriptions = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Rime fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Heavy drizzle",
    56: "Freezing drizzle",
    57: "Heavy freezing drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    66: "Freezing rain",
    67: "Heavy freezing rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Light rain showers",
    81: "Rain showers",
    82: "Heavy rain showers",
    85: "Light snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with hail",
    99: "Heavy thunderstorm with hail",
  };
  return descriptions[code] || "Conditions unavailable";
}

# Weatherly

Search for a city, country, or region to find matching places around the world.
Each result includes its region or state, country, continent, and time zone.
Choose a place to see current local conditions and a seven-day forecast.

Place search and forecasts use the free Open-Meteo geocoding and weather APIs.
The app's small Python server proxies those requests, so no API key or third-party
Python packages are needed.

## Run

Python 3.9 or newer is required.

1. Open a terminal in this folder.
2. Run `python server.py`.
3. Open `http://127.0.0.1:8000` in your browser.
4. Search for a place, then choose a matching result.

Stop the server with Ctrl+C.

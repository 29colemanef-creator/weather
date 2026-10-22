import json
import math
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request, urlopen


HOST = "127.0.0.1"
PORT = 8000
USER_AGENT = "Weatherly/2.0 (educational project)"
STATIC_FILES = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/app.js": ("app.js", "text/javascript; charset=utf-8"),
}
CONTINENT_BY_COUNTRY = {}
for continent, country_codes in {
    "Africa": (
        "AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EG EH ER ET GA GH GM GN GQ GW "
        "KE KM LR LS LY MA MG ML MR MU MW MZ NA NE NG RE RW SC SD SL SN SO SS "
        "SH ST SZ TD TG TN TZ UG YT ZA ZM ZW"
    ),
    "Asia": (
        "AF AM AZ BD BH BN BT CN GE HK ID IN IO IQ IR JO JP KG KH KW KZ LA LB "
        "LK MM MN MO MV MY NP OM PH PK PS QA SA SG SY TH TJ TL TM TR TW UZ AE "
        "VN YE"
    ),
    "Europe": (
        "AD AL AT AX BA BE BG BY CH CY CZ DE DK EE ES FI FO FR GB GG GI GR HR "
        "HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE "
        "SI SK SM UA VA XK"
    ),
    "North America": (
        "AG AI AW BB BL BM BQ BS BZ CA CR CU CW DM DO GD GL GP GT HN HT JM KN "
        "KY LC MF MQ MS MX NI PA PM PR SV SX TC TT US VC VG VI"
    ),
    "South America": "AR BO BR BV CL CO EC FK GF GS GY PE PY SR UY VE",
    "Oceania": (
        "AS AU CK CC CX FJ FM GU KI MH MP NC NF NR NU NZ PF PG PN PW SB TK TO TV "
        "UM VU WF WS"
    ),
    "Antarctica": "AQ",
}.items():
    for country_code in country_codes.split():
        CONTINENT_BY_COUNTRY[country_code] = continent


def continent_for_place(country_code, longitude):
    if country_code == "RU":
        return "Europe" if longitude < 60 else "Asia"
    if country_code == "KZ":
        return "Europe" if longitude < 50 else "Asia"
    if country_code == "TR":
        return "Europe" if longitude < 32.5 else "Asia"
    if country_code == "EG" and longitude > 34.5:
        return "Asia"
    if country_code == "ID" and longitude > 141:
        return "Oceania"
    return CONTINENT_BY_COUNTRY.get(country_code)


class WeatherServiceError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def request_json(url):
    request = Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
        },
    )
    try:
        with urlopen(request, timeout=15) as response:
            return json.loads(response.read())
    except HTTPError as error:
        raise WeatherServiceError(
            502,
            f"The weather service rejected the request (HTTP {error.code}). Please try again.",
        ) from error
    except URLError as error:
        raise WeatherServiceError(
            502,
            "The weather service could not be reached. Check your connection and try again.",
        ) from error
    except TimeoutError as error:
        raise WeatherServiceError(
            504,
            "The weather service request timed out. Please try again.",
        ) from error
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise WeatherServiceError(
            502,
            "The weather service returned an invalid response.",
        ) from error


class WeatherRequestHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/places":
            self.handle_places_request()
            return
        if path == "/api/forecast":
            self.handle_forecast_request()
            return

        static_file = STATIC_FILES.get(path)
        if static_file is None:
            self.send_error(404, "Not found")
            return

        filename, content_type = static_file
        try:
            with open(filename, "rb") as file:
                content = file.read()
        except OSError:
            self.send_error(500, "The application file could not be read.")
            return

        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def handle_places_request(self):
        query = parse_qs(urlparse(self.path).query, keep_blank_values=True)
        search_terms = query.get("q", [])
        if len(search_terms) != 1 or not search_terms[0].strip():
            self.send_json(400, {"error": "Enter a city, country, or region to search."})
            return
        search_term = search_terms[0].strip()
        if len(search_term) < 2 or len(search_term) > 80:
            self.send_json(400, {"error": "Search terms must be between 2 and 80 characters."})
            return

        url = "https://geocoding-api.open-meteo.com/v1/search?" + urlencode(
            {"name": search_term, "count": 20, "language": "en", "format": "json"}
        )
        try:
            response = request_json(url)
        except WeatherServiceError as error:
            self.send_json(error.status, {"error": str(error)})
            return

        results = response.get("results", []) if isinstance(response, dict) else []
        places = []
        if isinstance(results, list):
            for result in results:
                if not isinstance(result, dict):
                    continue
                latitude = result.get("latitude")
                longitude = result.get("longitude")
                country_code = result.get("country_code")
                if (
                    not isinstance(latitude, (int, float))
                    or not isinstance(longitude, (int, float))
                    or not math.isfinite(latitude)
                    or not math.isfinite(longitude)
                ):
                    continue
                places.append(
                    {
                        "id": result.get("id"),
                        "name": result.get("name"),
                        "region": result.get("admin1"),
                        "country": result.get("country"),
                        "countryCode": country_code,
                        "continent": continent_for_place(country_code, longitude),
                        "timezone": result.get("timezone"),
                        "latitude": latitude,
                        "longitude": longitude,
                    }
                )
        self.send_json(200, {"places": places})

    def handle_forecast_request(self):
        query = parse_qs(urlparse(self.path).query, keep_blank_values=True)
        try:
            latitude = self.read_coordinate(query, "latitude", -90, 90)
            longitude = self.read_coordinate(query, "longitude", -180, 180)
        except ValueError as error:
            self.send_json(400, {"error": str(error)})
            return

        forecast_url = "https://api.open-meteo.com/v1/forecast?" + urlencode(
            {
                "latitude": latitude,
                "longitude": longitude,
                "current": (
                    "temperature_2m,relative_humidity_2m,apparent_temperature,"
                    "is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m"
                ),
                "daily": (
                    "weather_code,temperature_2m_max,temperature_2m_min,"
                    "precipitation_probability_max"
                ),
                "timezone": "auto",
                "forecast_days": 7,
            }
        )
        try:
            forecast = request_json(forecast_url)
        except WeatherServiceError as error:
            self.send_json(error.status, {"error": str(error)})
            return

        current = forecast.get("current") if isinstance(forecast, dict) else None
        daily = forecast.get("daily") if isinstance(forecast, dict) else None
        if not isinstance(current, dict) or not isinstance(daily, dict):
            self.send_json(
                502,
                {"error": "The weather service did not return a usable forecast."},
            )
            return

        self.send_json(
            200,
            {
                "timezone": forecast.get("timezone"),
                "current": current,
                "daily": daily,
                "units": {
                    "temperature": forecast.get("current_units", {}).get(
                        "temperature_2m", "°C"
                    ),
                    "windSpeed": forecast.get("current_units", {}).get(
                        "wind_speed_10m", "km/h"
                    ),
                    "precipitationProbability": forecast.get("daily_units", {}).get(
                        "precipitation_probability_max", "%"
                    ),
                },
            },
        )

    @staticmethod
    def read_coordinate(query, name, minimum, maximum):
        values = query.get(name, [])
        if len(values) != 1 or not values[0]:
            raise ValueError(f"Provide exactly one {name} value.")

        try:
            value = float(values[0])
        except ValueError as error:
            raise ValueError(f"{name.capitalize()} must be a number.") from error

        if not math.isfinite(value) or not minimum <= value <= maximum:
            raise ValueError(
                f"{name.capitalize()} must be between {minimum} and {maximum}."
            )
        return value

    def send_json(self, status, data):
        content = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), WeatherRequestHandler)
    print(f"Weather app running at http://{HOST}:{PORT}")
    server.serve_forever()

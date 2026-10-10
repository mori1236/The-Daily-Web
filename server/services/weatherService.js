const CACHE_MS = 15 * 60 * 1000;
const WEATHER_URL = new URL('https://api.open-meteo.com/v1/forecast');
WEATHER_URL.search = new URLSearchParams({
    latitude: '32.0853', longitude: '34.7818', timezone: 'Asia/Jerusalem',
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day',
    hourly: 'temperature_2m,weather_code', forecast_days: '2',
    temperature_unit: 'celsius', wind_speed_unit: 'kmh',
}).toString();

function normalizeWeather(data) {
    const current = data.current;
    const hourly = data.hourly;
    const values = ['temperature_2m', 'apparent_temperature', 'relative_humidity_2m',
        'wind_speed_10m', 'weather_code', 'is_day'];
    if (!current || !values.every(key => Number.isFinite(current[key])) ||
        typeof current.time !== 'string' || !Array.isArray(hourly?.time) ||
        !Array.isArray(hourly.temperature_2m) || !Array.isArray(hourly.weather_code)) {
        throw new Error('Invalid weather response');
    }
    // ISO local times sort chronologically. Keep the next three four-hour slots,
    // including tomorrow when today's slots have passed.
    const forecast = hourly.time.flatMap((time, index) => {
        if (typeof time !== 'string' || time <= current.time ||
            Number(time.slice(11, 13)) % 4 !== 0 ||
            !Number.isFinite(hourly.temperature_2m[index]) ||
            !Number.isFinite(hourly.weather_code[index])) return [];
        return [{ time, temperature: hourly.temperature_2m[index], weatherCode: hourly.weather_code[index] }];
    }).slice(0, 3);
    if (forecast.length !== 3) throw new Error('Incomplete weather forecast');
    return {
        temperature: current.temperature_2m, feelsLike: current.apparent_temperature,
        humidity: current.relative_humidity_2m, windSpeed: current.wind_speed_10m,
        weatherCode: current.weather_code, isDay: current.is_day === 1,
        updatedAt: current.time, forecast,
    };
}

function createWeatherService(fetchWeather = fetch, now = Date.now) {
    let cached;
    let expiresAt = 0;
    let pending;
    return async function getWeather() {
        if (cached && now() < expiresAt) return cached;
        if (!pending) {
            pending = (async () => {
                const response = await fetchWeather(WEATHER_URL, { signal: AbortSignal.timeout(8000) });
                if (!response.ok) throw new Error('Weather provider unavailable');
                const weather = normalizeWeather(await response.json());
                cached = weather;
                expiresAt = now() + CACHE_MS;
                return weather;
            })().finally(() => { pending = undefined; });
        }
        return pending;
    };
}

module.exports = { getWeather: createWeatherService(), createWeatherService, normalizeWeather };

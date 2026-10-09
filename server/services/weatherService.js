// 10 דקות של מטמון כדי למנוע בקשות חוזרות מדי
const CACHE_DURATION = 10 * 60 * 1000;

let cachedWeather = null;
let lastFetchTime = 0;

async function getWeather() {
  const now = Date.now();

  if (
    cachedWeather &&
    now - lastFetchTime < CACHE_DURATION
  ) {
    return cachedWeather;
  }
//נ"צ של התחזית, ת"א
  const latitude = 32.0853;
  const longitude = 34.7818;

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m`;

  const response = await fetch(url);
//נבדק אם הבקשה הצליחה, אם לא - נשלח הודעת שגיאה מסודרת
  if (!response.ok) {
    throw new Error("Weather service is temporarily unavailable.");
  }

  const data = await response.json();

  cachedWeather = {
    temperature: data.current.temperature_2m,
    feelsLike: data.current.apparent_temperature,
    humidity: data.current.relative_humidity_2m,
    windSpeed: data.current.wind_speed_10m,
    weatherCode: data.current.weather_code,
    updatedAt: new Date().toISOString()
  };

  lastFetchTime = Date.now();

  return cachedWeather;
}

module.exports = {
  getWeather
};
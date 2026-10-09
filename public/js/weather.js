async function loadWeather() {
  const widget = document.querySelector(".weather-widget");

  if (!widget) {return;}
  try {
    const response = await fetch("/api/weather");

    if (!response.ok) {
      throw new Error("Failed to load weather");
    }

    const weather = await response.json();

    document.querySelector(".weather-temperature").textContent =
      `${Math.round(weather.temperature)}°C`;

    document.querySelector(".weather-feels-like").textContent =
      `${Math.round(weather.feelsLike)}°C`;

    document.querySelector(".weather-humidity").textContent =
      `${weather.humidity}%`;

    document.querySelector(".weather-wind").textContent =
      `${weather.windSpeed} km/h`;

    document.querySelector(".weather-description").textContent =
      getWeatherDescription(weather.weatherCode);

    document.querySelector(".weather-icon").textContent =
      getWeatherIcon(weather.weatherCode);

    const updated = new Date(weather.updatedAt);

    document.querySelector(".weather-updated").textContent =
      `עודכן: ${updated.toLocaleTimeString("he-IL", {
        hour: "2-digit",
        minute: "2-digit"
      })}`;

  } catch (error) {
    console.error("Weather widget error:", error);

    document.querySelector(".weather-description").textContent =
      "מזג האוויר אינו זמין כרגע";
  }
}

function getWeatherDescription(code) {
  if (code === 0) {
    return "בהיר";
  }

  if (code === 1 || code === 2) {
    return "מעונן חלקית";
  }

  if (code === 3) {
    return "מעונן";
  }

  if (code === 45 || code === 48) {
    return "ערפל";
  }

  if (code >= 51 && code <= 67) {
    return "גשם";
  }

  if (code >= 71 && code <= 77) {
    return "שלג";
  }

  if (code >= 80 && code <= 82) {
    return "ממטרים";
  }

  if (code >= 95) {
    return "סופת רעמים";
  }

  return "מזג אוויר";
}

function getWeatherIcon(code) {
  if (code === 0) {
    return "☀️";
  }

  if (code <= 3) {
    return "⛅";
  }

  if (code === 45 || code === 48) {
    return "🌫️";
  }

  if (code >= 51 && code <= 67) {
    return "🌧️";
  }

  if (code >= 71 && code <= 77) {
    return "❄️";
  }

  if (code >= 80 && code <= 82) {
    return "🌦️";
  }

  if (code >= 95) {
    return "⛈️";
  }

  return "🌤️";
}

loadWeather();
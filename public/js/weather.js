async function loadWeather() {
  const widget = document.getElementById("weatherWidget");

  if (!widget) {
    return;
  }

  try {
    const response = await fetch("/api/weather");

    if (!response.ok) {
      throw new Error("Failed to load weather data from the server.");
    }

    // Parsing weather data from the server response
    const weather = await response.json();

    const temperatureElement =
      widget.querySelector(".weather-temp");

    const feelsLikeElement =
      widget.querySelector(".weather-feels");

    const humidityElement =
      widget.querySelector(".weather-humidity");

    const windElement =
      widget.querySelector(".weather-wind");

    const descriptionElement =
      widget.querySelector(".weather-description");

    const IconElement =
      widget.querySelector(".weather-icon");

    temperatureElement.textContent =
      `${Math.round(weather.temperature)}°`;

    feelsLikeElement.textContent =
      `מרגיש כמו ${Math.round(weather.feelsLike)}°`;

    humidityElement.textContent =
      `${weather.humidity}% לחות`;

    windElement.textContent =
      `${weather.windSpeed} קמ"ש`;

    descriptionElement.textContent =
      getWeatherDescription(weather.weatherCode);
    
    IconElement.textContent =
      getWeatherIcon(weather.weatherCode);
  } catch (error) {
    console.error("Weather widget error:", error);

    const descriptionElement =
      widget.querySelector(".weather-description");

    descriptionElement.textContent =
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
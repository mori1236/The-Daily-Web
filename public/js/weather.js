(() => {
const widgets = Array.from(document.querySelectorAll('[data-weather-widget]'));
if (!widgets.length) return;

function setText(widget, selector, text) {
    const element = widget.querySelector(selector);
    if (element) element.textContent = text;
}

async function loadWeather() {
    widgets.forEach(widget => widget.setAttribute('aria-busy', 'true'));
    try {
        const response = await fetch('/api/weather', { signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error('Weather unavailable');
        const weather = await response.json();
        widgets.forEach(widget => {
            setText(widget, '.weather-temp', Math.round(weather.temperature) + '°');
            setText(widget, '.weather-feels', 'מרגיש כמו ' + Math.round(weather.feelsLike) + '°');
            setText(widget, '.weather-humidity', 'לחות ' + Math.round(weather.humidity) + '%');
            setText(widget, '.weather-wind', 'רוח ' + Math.round(weather.windSpeed) + ' קמ״ש');
            const description = getWeatherDescription(weather.weatherCode);
            const icon = widget.querySelector('.weather-icon');
            icon.innerHTML = getWeatherIconSvg(weather.weatherCode, weather.isDay);
            icon.setAttribute('title', description);
            icon.setAttribute('role', 'img');
            icon.setAttribute('aria-label', description);
            widget.setAttribute('title', description + ' · עודכן ' + weather.updatedAt.slice(11,16) + ' · Open-Meteo');
            setText(widget, '.weather-status', 'עודכן ' + weather.updatedAt.slice(11,16));
            const forecast = widget.querySelector('.weather-forecast');
            if (forecast) forecast.replaceChildren(...weather.forecast.map(item => {
                const row = document.createElement('div');
                row.className = 'forecast-row';
                const time = document.createElement('span');
                time.className = 'forecast-time';
                time.textContent = item.time.slice(11,16) + (item.time.slice(0,10) !== weather.updatedAt.slice(0,10) ? ' מחר' : '');
                const dot = document.createElement('span');
                dot.className = 'forecast-dot';
                dot.textContent = '·';
                const value = document.createElement('span');
                value.className = 'forecast-val';
                value.textContent = Math.round(item.temperature) + '° ' + getWeatherDescription(item.weatherCode);
                row.append(time, dot, value);
                return row;
            }));
        });
    } catch {
        widgets.forEach(widget => {
            setText(widget, '.weather-temp', '--°');
            setText(widget, '.weather-feels', 'מרגיש כמו --°');
            setText(widget, '.weather-humidity', 'לחות --%');
            setText(widget, '.weather-wind', 'רוח -- קמ״ש');
            setText(widget, '.weather-status', 'מזג האוויר אינו זמין כרגע');
            widget.setAttribute('title', 'מזג האוויר אינו זמין כרגע');
            const icon = widget.querySelector('.weather-icon');
            icon.replaceChildren();
            icon.setAttribute('aria-label', 'מזג האוויר אינו זמין כרגע');
            const forecast = widget.querySelector('.weather-forecast');
            if (forecast) forecast.replaceChildren();
        });
    } finally {
        widgets.forEach(widget => widget.setAttribute('aria-busy', 'false'));
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

  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
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
//According to the weather code from the API, selecting icon to be displayed in the header
function getWeatherIconSvg(code, isDay = true) {
  if ((code === 0 || code === 1) && !isDay) {
    return '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/></svg>';
  }
  if (code === 0) {
    //שמש
    return `
      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="5"></circle>
        <line x1="12" y1="1" x2="12" y2="3"></line>
        <line x1="12" y1="21" x2="12" y2="23"></line>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
        <line x1="1" y1="12" x2="3" y2="12"></line>
        <line x1="21" y1="12" x2="23" y2="12"></line>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
      </svg>
    `;
  }

  if (code === 1 || code === 2) {
    // מעונן חלקית
    return `
      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="9" cy="9" r="3"></circle>
        <line x1="9" y1="2" x2="9" y2="4"></line>
        <line x1="9" y1="14" x2="9" y2="16"></line>
        <line x1="2" y1="9" x2="4" y2="9"></line>
        <line x1="14" y1="9" x2="16" y2="9"></line>
        <line x1="4.5" y1="4.5" x2="6" y2="6"></line>
        <line x1="12" y1="12" x2="13.5" y2="13.5"></line>
        <path d="M17 18H8a3 3 0 1 1 .6-5.94A4.5 4.5 0 0 1 17 13a2.5 2.5 0 1 1 0 5Z"></path>
      </svg>
    `;
  }

  if (code === 3) {
    // מעןנם
    return `
      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M17 18H7a4 4 0 1 1 .8-7.92A5.5 5.5 0 0 1 18 11a3 3 0 1 1-1 7Z"></path>
      </svg>
    `;
  }

  if (code === 45 || code === 48) {
    // Fog
    return `
      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M17 10H7a4 4 0 1 1 .8-7.92A5.5 5.5 0 0 1 18 3a3 3 0 1 1-1 7Z"></path>
        <line x1="4" y1="14" x2="20" y2="14"></line>
        <line x1="6" y1="18" x2="18" y2="18"></line>
      </svg>
    `;
  }

  if (code >= 51 && code <= 67) {
    // Rain
    return `
      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M17 14H7a4 4 0 1 1 .8-7.92A5.5 5.5 0 0 1 18 7a3 3 0 1 1-1 7Z"></path>
        <line x1="9" y1="17" x2="8" y2="21"></line>
        <line x1="13" y1="17" x2="12" y2="21"></line>
        <line x1="17" y1="17" x2="16" y2="21"></line>
      </svg>
    `;
  }

  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    // Snow
    return `
      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M17 14H7a4 4 0 1 1 .8-7.92A5.5 5.5 0 0 1 18 7a3 3 0 1 1-1 7Z"></path>
        <path d="M8 18h0"></path>
        <path d="M12 18h0"></path>
        <path d="M16 18h0"></path>
        <path d="M8 17v4"></path>
        <path d="M6.5 18.5h3"></path>
        <path d="M6.9 17.4l2.2 2.2"></path>
        <path d="M9.1 17.4l-2.2 2.2"></path>
        <path d="M12 17v4"></path>
        <path d="M10.5 18.5h3"></path>
        <path d="M10.9 17.4l2.2 2.2"></path>
        <path d="M13.1 17.4l-2.2 2.2"></path>
      </svg>
    `;
  }

  if (code >= 80 && code <= 82) {
    // Showers
    return `
      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M17 14H7a4 4 0 1 1 .8-7.92A5.5 5.5 0 0 1 18 7a3 3 0 1 1-1 7Z"></path>
        <line x1="8" y1="17" x2="7" y2="20"></line>
        <line x1="12" y1="18" x2="11" y2="21"></line>
        <line x1="16" y1="17" x2="15" y2="20"></line>
      </svg>
    `;
  }

  if (code >= 95) {
    // Thunderstorm
    return `
      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M17 14H7a4 4 0 1 1 .8-7.92A5.5 5.5 0 0 1 18 7a3 3 0 1 1-1 7Z"></path>
        <path d="M13 16l-2 4h2l-1 3 4-5h-2l1-2z"></path>
      </svg>
    `;
  }

  // Default
  return `
    <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="5"></circle>
      <line x1="12" y1="1" x2="12" y2="3"></line>
      <line x1="12" y1="21" x2="12" y2="23"></line>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
      <line x1="1" y1="12" x2="3" y2="12"></line>
      <line x1="21" y1="12" x2="23" y2="12"></line>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
    </svg>
  `;
}


loadWeather();
setInterval(loadWeather, 15 * 60 * 1000);
})();

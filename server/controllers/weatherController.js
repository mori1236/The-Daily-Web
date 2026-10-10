const weatherService = require("../services/weatherService");

async function getWeather(req, res) {
  try {
    const weather = await weatherService.getWeather();

    res.set('Cache-Control', 'no-store');
    res.json(weather);
  } catch (error) {
    console.error("Weather error:", error);
    res.status(503).json({ //להתריע שהשירות אינו זמין כרגע
      error: "Weather service is temporarily unavailable"
    });
  }
}
module.exports = {
  getWeather
};

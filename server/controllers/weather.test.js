const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createWeatherService, normalizeWeather } = require('../services/weatherService');

function fixture() {
    return {
        current: { time: '2026-10-09T21:15', temperature_2m: 24.2,
            apparent_temperature: 26.1, relative_humidity_2m: 63,
            wind_speed_10m: 18, weather_code: 0, is_day: 0 },
        hourly: { time: ['2026-10-09T20:00', '2026-10-10T00:00', '2026-10-10T04:00', '2026-10-10T08:00'],
            temperature_2m: [25, 23, 21, 26], weather_code: [0, 2, 3, 0] },
    };
}

test('weather uses provider readings and upcoming forecast slots across midnight', () => {
    const weather = normalizeWeather(fixture());
    assert.equal(weather.temperature, 24.2);
    assert.equal(weather.isDay, false);
    assert.deepEqual(weather.forecast.map(item => item.time),
        ['2026-10-10T00:00', '2026-10-10T04:00', '2026-10-10T08:00']);
    const missing = fixture();
    missing.current.temperature_2m = null;
    assert.throws(() => normalizeWeather(missing), /Invalid/);
    const incomplete = fixture();
    incomplete.hourly.temperature_2m[2] = null;
    assert.throws(() => normalizeWeather(incomplete), /Incomplete/);
});

test('weather shares concurrent fetches, caches for fifteen minutes, then refreshes', async () => {
    let clock = 0;
    let calls = 0;
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const getWeather = createWeatherService(async (url, options) => {
        calls++;
        assert.equal(url.searchParams.get('timezone'), 'Asia/Jerusalem');
        assert.equal(url.searchParams.get('wind_speed_unit'), 'kmh');
        assert.ok(options.signal);
        await gate;
        return { ok: true, json: async () => fixture() };
    }, () => clock);
    const requests = [getWeather(), getWeather()];
    assert.equal(calls, 1);
    release();
    const [first, second] = await Promise.all(requests);
    assert.deepEqual(first, second);
    await getWeather();
    assert.equal(calls, 1);
    clock = 900000;
    await getWeather();
    assert.equal(calls, 2);
});

test('failed or malformed weather responses can recover on the next request', async () => {
    for (const failure of [async () => { throw new Error('timeout'); },
        async () => ({ ok: false }), async () => ({ ok: true, json: async () => ({}) })]) {
        let fail = true;
        const getWeather = createWeatherService((...args) => fail ? failure(...args) :
            Promise.resolve({ ok: true, json: async () => fixture() }));
        await assert.rejects(getWeather());
        fail = false;
        assert.equal((await getWeather()).temperature, 24.2);
    }
});

function element() {
    return { textContent: '', innerHTML: '', children: [], attributes: {},
        setAttribute(key, value) { this.attributes[key] = value; },
        replaceChildren(...children) { this.children = children; this.innerHTML = ''; },
        append(...children) { this.children.push(...children); } };
}

test('one request updates both header and card; a failed refresh clears stale readings', async () => {
    function widget(full) {
        const result = element();
        const children = {};
        for (const selector of ['.weather-temp', '.weather-icon', ...(full ?
            ['.weather-feels', '.weather-humidity', '.weather-wind', '.weather-status', '.weather-forecast'] : [])]) {
            children[selector] = element();
        }
        result.querySelector = selector => children[selector] || null;
        return result;
    }
    const header = widget(false);
    const card = widget(true);
    let fail = false;
    let calls = 0;
    let refresh;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../public/js/weather.js'), 'utf8'), {
        document: { querySelectorAll: () => [header, card], createElement: element },
        AbortSignal,
        setInterval(callback, interval) { refresh = callback; assert.equal(interval, 900000); },
        async fetch() { calls++; return { ok: !fail, json: async () => normalizeWeather(fixture()) }; },
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 1);
    assert.equal(header.querySelector('.weather-temp').textContent, '24°');
    assert.equal(card.querySelector('.weather-feels').textContent, 'מרגיש כמו 26°');
    assert.equal(card.querySelector('.weather-humidity').textContent, 'לחות 63%');
    assert.equal(card.querySelector('.weather-forecast').children.length, 3);
    assert.equal(card.querySelector('.weather-forecast').children[0].children[0].textContent, '00:00 מחר');
    assert.match(header.querySelector('.weather-icon').innerHTML, /M20.9/); // Moon at night.
    fail = true;
    await refresh();
    assert.equal(card.querySelector('.weather-temp').textContent, '--°');
    assert.equal(header.querySelector('.weather-temp').textContent, '--°');
    assert.equal(card.querySelector('.weather-forecast').children.length, 0);
    assert.equal(card.querySelector('.weather-status').textContent, 'מזג האוויר אינו זמין כרגע');
    assert.equal(card.attributes['aria-busy'], 'false');
});

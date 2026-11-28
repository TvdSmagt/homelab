# Integrations

Set up in the UI (*Settings → Devices & services*), stored in `.storage`. What breaks when one is gone:
[Home](../index.md).

| Integration | Link | Brings | More |
|---|---|---|---|
| Tado | cloud, daily API limit | 4 zones, hot water, valve batteries | [CV-ketel](../cv-ketel.md) |
| Philips Hue | local | lights, scenes, switch events and batteries | |
| DSMR | USB | electricity per tariff, power, gas (hourly) | [Smart meter](../smart-meter.md) |
| MQTT | `localhost:1883` | Growatt inverter via Grott | [Growatt](../growatt-datalogger.md) |
| LG ThinQ | cloud | airco downstairs and upstairs | [Solar heating](../solar-heating.md) |
| Google Cast | local | Nest Hub, speakers | [Nest Hub](../nest-display.md) |
| Matter, Thread, OTBR | local | nothing paired yet | [Matter](../matter-thread.md) |
| Met.no | cloud | `weather.forecast_home` | |
| Forecast.Solar | cloud, 2 entries (strings) | solar forecast | |
| Mobile App | phone | location, `notify.pixel_10_pro_xl` | |
| UPnP, Sun, Bluetooth (not working), TTS, Radio Browser, Shopping list | | defaults, unused | |

EnergyZero prices and Buienradar rain are REST sensors in [packages](packages.md), not integrations.

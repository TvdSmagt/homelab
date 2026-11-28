# CV-ketel: Nefit ProLine NxT HRC 24/CW4

Combiketel (artikelnummer 7746901851), aangestuurd door **Tado via OpenTherm** (bedrade Tado-thermostaat in de
woonkamer). Er is geen boilervat: de ketel verwarmt het tapwater pas als je de kraan opendraait. Tado kiest zelf de
temperatuur van het water dat naar de radiatoren gaat; de ketel bewaakt alleen de bovengrens (P1) en het
maximale vermogen (P2).

Home Assistant heeft geen ketelgegevens, alleen de Tado-zones en het gasverbruik per uur (P1-meter, sinds
2026-11-21). Uitlezen kan alleen op de ketel zelf, via het info-menu.

## Bedieningspaneel

```
 [menu]   display   [▲ +]
 [info]   display   [▼ –]
```

| Knop(pen) | Wat het doet |
|---|---|
| **info** | Info-menu openen (meetwaarden `i1`–`i9`) |
| **menu** | Instelmenu openen (`P1`–`P7`) |
| **▲ / ▼** | Door een menu lopen, of een knipperende waarde wijzigen |
| **▲ + ▼** samen, 5 s | Kinderslot aan/uit (`Lo` in beeld = vergrendeld; het info-menu werkt dan nog wel) |
| **▲ + ▼** samen, kort | Bij een storingscode: de aanvullende code tonen |
| **info** 5 s | Historiemenu: de laatste 3 storingen |
| **menu + ▲** samen | Servicestand (knipperende moersleutel): ketel stookt op een vast vermogen. **Niet gebruiken.** Per ongeluk aan? Nog een keer menu + ▲. |
| **▼ + info** samen | Reset, alleen nodig bij een knipperende storingscode |

Normaal toont het display de **waterdruk**, bijvoorbeeld `2.0 bar`. Die moet tussen **1,0 en 2,0 bar** liggen.
Onder 1,1 bar knippert hij: dan moet de installatie worden bijgevuld (tot ±2 bar).

### Symbolen

| Symbool | Betekenis |
|---|---|
| radiatortje | Ketel verwarmt het huis |
| kraantje | Ketel maakt warm water |
| vlammetje | Brander brandt |
| moersleutel | Onderhoud nodig |

### Codes

| Code | Betekenis |
|---|---|
| `-H` | In bedrijf voor verwarming |
| `=H` | In bedrijf voor warm water |
| `0C` / `0L` / `0U` | Is aan het opstarten |
| `0E` | Wacht even voordat hij opnieuw aanslaat. Zie je dit vaak terwijl Tado om warmte vraagt, dan gaat de ketel steeds aan en uit (pendelen). |
| `0H` | Stand-by, geen warmtevraag |
| `0Y` | Krijgt zijn warmte niet kwijt aan de radiatoren en wacht |
| `2E` | Waterdruk te laag: bijvullen |
| knipperende code | Storing; ketel is vergrendeld en moet gereset worden |

## Info-menu: meetwaarden aflezen

Druk op **info** en loop met **▼** door de lijst.

| Code | Wat het is |
|---|---|
| `i1` | Bedrijfs- of storingscode (zie *Codes*) |
| `i2` | Waterdruk (bar) |
| `i3` | Ionisatiestroom (µA), alleen voor de monteur |
| `i4` | Temperatuur van het water **naar** de radiatoren (°C) |
| `i5` | Temperatuur van het water dat **terugkomt** (°C) |
| `i6` | Temperatuur die **Tado vraagt** (°C) |
| `i7` | Hoe hard de brander brandt (%); ±25% is de laagste stand |
| `i8` | Hoe hard de pomp draait (%) |
| `i9` | Bij warm water tappen: liters per minuut |

**Waar je op let:**
- `i5` meestal **onder 55 °C**: dan condenseert de ketel en haalt hij zijn hoge rendement.
- `i4` min `i5` tussen **10 en 25 °C** is goed. Veel meer, en een radiator is boven heet en onder koud? Dan
  stroomt er te weinig water door: eerst ontluchten of de radiatorkraan verder openzetten, anders P6 omhoog.
- `i6` gelijk aan P1 terwijl het huis niet warm wordt: P1 is de grens, zet hem hoger.

## Instelmenu: P1–P7

### Een instelling wijzigen
1. Druk op **menu**. Je ziet `P1` met de huidige waarde.
2. Ga met **▲ / ▼** naar de instelling die je wilt wijzigen.
3. Houd **menu** ingedrukt tot de waarde **knippert**.
4. Wijzig de waarde met **▲ / ▼**.
5. Druk op **menu** om op te slaan. De waarde stopt met knipperen.

Noteer de oude waarde voordat je iets wijzigt. Hoe je het menu verlaat staat niet in de handleiding; het display
lijkt vanzelf terug te gaan naar de waterdruk als je even niets drukt.

### Instellingen

| | Wat het is | Fabriek | Nu | Opmerking |
|---|---|---|---|---|
| **P1** | Maximale temperatuur van het water naar de radiatoren (30–85 °C) | 75 | **60** | Tado mag niet hoger dan dit. Zo laag mogelijk is zuiniger, maar de kamers moeten op een vorstdag nog warm worden. |
| **P2** | Maximaal vermogen voor verwarming (6–24 kW) | 15 | **10** | Geldt niet voor warm water. Het huis vraagt bij vorst ±6 kW, dus 10 is ruim genoeg. |
| **P3** | Warmhouden voor warm water: 0 = warm water uit, 1 = zuinig, 2 = normaal, 3 = snel | 2 | niet genoteerd | **Nooit op 0** zetten, dan komt er geen warm water meer. Wordt ook door Tado geregeld (zie hieronder). |
| **P4** | Temperatuur van het warme water uit de kraan (30–60 °C) | 60 | niet genoteerd | Geen boilervat, dus legionella is geen reden voor 60. 55 is genoeg. |
| **P5** | Minimaal pomptoerental (%) | 40 | **40** | Was 30, op 2026-11-28 naar 40. |
| **P6** | Maximaal pomptoerental (%) | 90 | **80** | Was 60, op 2026-11-28 naar 80. Meer water door de radiatoren = ze worden over hun hele oppervlak warmer. |
| **P7** | Hoe lang de pomp nadraait (min) | 1 | niet genoteerd | Laten staan. |

### Warm water aan/uit in Tado
De knop *Warm water* in Tado zet niet het warme water zelf aan of uit, maar het **warmhouden** van de ketel:
- **Aan:** warm water komt snel, kost een beetje gas, ook als je niet tapt.
- **Uit:** warm water komt een paar seconden later.

Stond in november 2026 de hele tijd uit.

## Waar we staan (2026-11-28)

**Probleem:** bij vorst vraagt zone *Beneden* de hele dag 100% warmte en haalt hij de 19 °C niet (blijft rond
17–18 °C). Het gasverbruik blijft dan vlak op ±0,5–0,7 m³ per uur, ongeacht de buitentemperatuur.

**Meting 2026-11-28 11:37**, bij ±0 °C buiten, Beneden op 18,2 °C:
`i4` 52 · `i5` 43 · `i6` 57 · `i7` 34%. Tado vroeg 57 °C, dus P1 (60) hield toen nog niet tegen. P2 (10 kW)
ook niet: de ketel stookte ±6 kW.

**Aangepast:** alleen de pomp (P5 30 → 40, P6 60 → 80), op 2026-11-28 rond 10:00.

**Volgende stappen:**
1. 2–3 dagen niets wijzigen en kijken of Beneden 's ochtends sneller 19 °C haalt (verloop van
   `sensor.beneden_beneden_temperature` en het gasverbruik per uur naast die van 2026-11-24 t/m 28 leggen).
2. Haalt hij het nog steeds niet: **P1 naar 65 °C**. Tado vroeg bij 0 °C al 57, dus bij echte vorst loopt hij
   tegen de 60 aan.
3. In de Tado-app *Vroege start* aanzetten voor Beneden: dan is het om 07:00 al warm, in plaats van dat de
   radiatoren dan pas vanaf 15–16 °C beginnen.
4. Op koude ochtenden helpt de airco beneden: bij vorst rendement ±2,5–3, en vanaf ±1,6 is hij goedkoper dan
   gas (zie [solar-heating.md](solar-heating.md)).

**Home Assistant koppelen aan de ketel** kan met een OpenTherm Gateway tussen Tado en de ketel (±€60–100). Voor
nu niet gedaan.

## Bronnen
- [Installatie-instructie ProLine NxT (6721823664, 2023/12)](https://portal.insmart.nl/downloads/prolineNxtInstallatiehandleiding.pdf):
  bediening op p. 23, storingscodes in hoofdstuk 11.
- [Gebruikersinstructie ProLine NxT (6721823666, 2021/06)](https://portal.insmart.nl/downloads/nefit_proline_nxt_6721823666.pdf)

# StadiView

**Experience every seat before match day.**

StadiView is an interactive, procedural 3D football stadium concept. Explore the stadium, select from thousands of generated seats, and fly into a first person preview of the view from each one.

> [!NOTE]
> StadiView is a concept demo. The 3D bowl, the seat views, prices, and availability are simulated; no real tickets are sold here. The section numbers, the match card and the upcoming event list with its advertised price floors, and the parking and bag rules are real, sourced data — see [Stadium facts used in the UI](#stadium-facts-used-in-the-ui).

## Highlights

- A fully procedural stadium with no imported 3D models
- Thousands of individually selectable seats rendered efficiently with instancing
- Animated camera flights and first person seat views
- Generated seat previews, pricing, availability, tiers, blocks, and benefits
- A view score for every seat (45-99), worked out from distance to the pitch, halfway-line
  alignment and elevation
- Seat prices in USD, scaled to the resale floor the feed measured for that fixture
- Player kits that take the two clubs' real colours from the same feed that writes the match card
- Animated players, ball, crowd, lighting, scoreboards, and pitch side displays
- Stadium overview, mini map, orbit controls, keyboard support, and reduced motion handling
- Parking, clear bag policy, and upcoming event panels in the top nav, each pointing at the
  official page or the seller
- A match card that regenerates itself from the venue's published fixture feed, on a daily schedule
- A self contained experience in `index.html`, powered by Three.js and GSAP

## Try it locally

```bash
npm install
npm run dev
```

Then open the local address shown by Vite.

## Controls

| Action                     | Control                                       |
| -------------------------- | --------------------------------------------- |
| Rotate around the stadium  | Click or touch and drag                       |
| Zoom                       | Mouse wheel or on screen controls              |
| Preview a seat             | Click a seat                                  |
| Look around from a seat    | Drag while in seat view                       |
| Leave seat view            | Press <kbd>Esc</kbd> or use “Back to stadium” |
| Confirm the demo selection | Press <kbd>Enter</kbd> or use “Grab seat”     |
| Buy tickets                | Cart icon, top right, opens the seller         |

## Stadium facts used in the UI

The 3D bowl is still procedural, but the numbers on it and the visit panels are taken from
published MetLife Stadium data. Everything below was read from the source named next to it.

### Section numbering

The wedges carry MetLife's real section ids instead of a made-up `101..N` run, so the gaps and
the lettered sub-blocks are the venue's own:

| Tier | Wedges | Real blocks at that level | Ids shown |
| --- | --- | --- | --- |
| Lower | 32 | 36 | 101-149 with the real holes (no 125, 127, 130, 132, 136, 138, 141, 145, 147) plus 111A/111C/115A/115C |
| Club | 24 | 60 | 201-250 with the A/B/C sub-blocks, e.g. 202B, 205A, 228A |
| Upper | 32 | 50 | 301-350 |

Each wedge is labelled with the real block nearest its own angle around the bowl, so the
numbering walks the stadium in the same direction and with the same gaps as the official chart.
The bowl has fewer wedges than the venue has blocks, so some real blocks are not modelled.

- Source: Ticketmaster geometry service, `mapsapi.tmol.io/maps/geometry/3/event/00006491C2BEE002`,
  fetched 2026-10-04: 146 blocks, 77,759 seats, level counts 100/200/300 = 36/60/50.
- The featured seat the app opens with is Section 139, a real lower tier sideline block.

### Parking

Checked 2026-10-03 against [metlifestadium.com/plan-your-visit/parking-tailgating](https://www.metlifestadium.com/plan-your-visit/parking-tailgating)
and its [general event parking](https://www.metlifestadium.com/plan-your-visit/parking-tailgating/general-event-parking) page.

- Lots typically open 5 hours before an event and close 2 hours after it ends.
- Pre-paid permits for non-NFL events go through [ParkWhiz](https://www.parkwhiz.com/metlife-stadium-parking/);
  on-arrival parking is still available.
- Drivers are directed to the lot closest to their point of entry; circulating between lots is not permitted.
- Overnight parking is not permitted on the MetLife Sports Complex.
- Charter bus parking is in Lot L.
- Taxi and limo drop-off/pick-up is between Lots D and E.
- Rideshare drops off on the roadway between Lots D and E; pick-up is in Lot E.
- Park & Ride: park at Secaucus Junction and take NJ TRANSIT to the complex.
- Lot map: [MetLife-Stadium-Parking-Map_2026-3-2-26.pdf](https://www.metlifestadium.com/assets/doc/MetLife-Stadium-Parking-Map_2026-3-2-26-21906c0f8b.pdf)

### Clear bag policy

Checked 2026-10-03 against the [official clear bag policy](https://www.metlifestadium.com/plan-your-visit/a-z-guide/clear-bag-policy/).

- One bag per guest: clear bag up to 12" x 6" x 12", a small non-clear clutch up to 4.5" x 6.5",
  or a one-gallon clear plastic freezer bag.
- Not approved: any non-clear bag larger than 4.5" x 6.5" (backpacks, fanny packs, camera and
  binocular cases, diaper bags, briefcases and computer bags), and seat cushions of any size
  except those needed for medical reasons.
- Bag check is complimentary at NFL events and $5 at other events.
- Medically necessary items are allowed after inspection at a designated gate; every guest and
  possession is searched before entry.

### Upcoming events and price floors

The Tickets panel lists the events the venue is currently publishing, each with the resale floor
the seller advertises at that moment, and links out with `rel="sponsored nofollow noopener"`.
Floors move until the gates open, so treat them as a snapshot.

The cart icon in the top right is the other way out. It counts the seats you grabbed in this
session — the badge is the real count, and it stays hidden at zero — and clicking it opens the
seller page for the fixture the match card is showing, resolved from the ticket rows so it follows
the feed rather than a second hardcoded URL. StadiView holds no cart server-side and sells
nothing; if the browser blocks the pop-up, the ticket list opens in place instead.

### Upcoming match card, and how it stays current

The card in the top-left corner is generated, not written. `npm run refresh:match` reads two
published listings at the venue and rewrites two marked regions of `index.html`: the match card,
and the event rows plus their capture date inside the Tickets panel.

- Source of truth: `metlifestadium.com/events`. Its `Event` JSON-LD carries the fixture name, a
  kick-off with a real `-04:00`/`-05:00` offset, the Ticketmaster event URL, and the venue's own
  detail page. It lists roughly the next month.
- Prices: `tickpick.com/venues/metlife-stadium/tickets/`, whose `SportsEvent` JSON-LD carries the
  advertised resale floor. It runs further out, so events the venue page has dropped off still
  keep a row.
- The two are joined on the kick-off slot rather than on the name, because they label concerts
  differently ("Usher Raymond & Chris Brown" vs "Usher & Chris Brown").
- The resale feed stamps local wall-clock times with a trailing `Z`. Re-reading those digits as
  venue-local is what keeps 1 November at 1:00 PM EST instead of drifting an hour across the DST
  boundary.
- The card shows the next fixture between two known teams; team chips are two flat colours from
  `scripts/refresh-match.mjs`, not club logos.
- If a feed is down or lists no fixture, the script leaves `index.html` untouched rather than
  blanking the card. Cancelled events are dropped.
- Everything the run read lands in `public/match.json` (`generatedAt`, per-event kick-off in both
  UTC and venue-local, both seller URLs, and the floor it came from).

`.github/workflows/refresh-match.yml` runs it daily at 12:17 UTC and commits the new snapshot, so
the card moves with the venue calendar on its own. Run it by hand after a schedule change:

```bash
npm run refresh:match -- --dry-run   # show what would change
npm run refresh:match
```

- Sources: `metlifestadium.com/events` and the TickPick venue listing, both read 2026-10-04.

### Seat prices

Prices are in USD and come from two steps:

1. Each tier has a curve keyed to that seat's view score — Lower `60 + score x 1.16`, Club
   `70 + score x 1.3`, Upper `24 + score x 0.75`.
2. The whole set is multiplied by `priceFloorUsd / 59`. The floor is the resale number the feed
   measured for the fixture on the card, carried as `data-price-floor`, and `59` is the tuning
   constant that puts the cheapest sellable upper-tier seat on the real advertised floor.

On the current $59 floor that works out to roughly $112-175 Lower, $129-199 Club and $58-98 Upper,
and the seat the app opens with — Section 139, Row 12, Seat 18 — shows $168. A $126 headline game
prices about 2.1x a $59 one. A floor outside $20-5000 is ignored and the index falls back to 1:1, so
a bad fetch cannot price a seat at $2.

The number is therefore a way to compare seats with each other and against that day's market. It is
not a quote, and StadiView sells nothing.

### Kit colours

The players wear the fixture rather than a fixed palette. `scripts/refresh-match.mjs` holds 33
clubs with their two published colours and writes them onto the match-card flags as `--c1` and
`--c2`; the 3D scene reads the first as the shirt and the second as the shorts. Colours below
0.42 HSL lightness are lifted in lightness only — hue and saturation stay — because a navy such as
`#0b2265` otherwise reads as black under floodlight. Goalkeeper kits and the official's colours are
fixed, and the old literals stay as fallbacks so the scene still renders if the card is ever
hand-edited.

## Support the project

If StadiView sparked an idea or you would like to support more experimental, vibe coded projects like this, you can [buy me a coffee through PayPal](https://paypal.me/gunalesujata). No pressure. The best support is enjoying the project and sharing it with someone who might like it. ☕

## Licensing

StadiView is available under the [PolyForm Noncommercial License 1.0.0](LICENSE.md). You may study, share, and adapt it for permitted noncommercial purposes while keeping the required copyright and license notices.

Commercial use requires a separate commercial license. This includes use in a paid product, client project, ticketing platform, stadium or club experience, or other business activity. See [Commercial licensing](COMMERCIAL-LICENSE.md) for the next step.

This project is source available. It is not an OSI approved open source project. Third party libraries remain covered by their own licenses. See [Third party notices](THIRD_PARTY_NOTICES.md).

## Creator and contact

Created by **thebuggeddev**.

Find [@thebuggeddev on GitHub](https://github.com/thebuggeddev) and [@thebuggeddev on X](https://x.com/thebuggeddev).

Send email to [thebuggeddev@gmail.com](mailto:thebuggeddev@gmail.com).

Copyright © 2026 thebuggeddev.

/**
 * Refresh the upcoming-match card and the Tickets event list from the venue's
 * own published feeds, then rewrite the marked regions of index.html.
 *
 *   node scripts/refresh-match.mjs            # fetch + write
 *   node scripts/refresh-match.mjs --dry-run  # print, change nothing
 *
 * Sources, both keyless:
 *   metlifestadium.com/events  JSON-LD Event[] - authoritative name, kickoff
 *     with a real -04:00/-05:00 offset, Ticketmaster event URL, detail page
 *   tickpick venue page        JSON-LD SportsEvent[] - resale price floor
 * The first one decides what the card says; the second only supplies prices.
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HTML_FILE = path.join(ROOT, "index.html");
const JSON_FILE = path.join(ROOT, "public", "match.json");

const OFFICIAL_URL = "https://www.metlifestadium.com/events";
const RESALE_URL = "https://www.tickpick.com/venues/metlife-stadium/tickets/";
const VENUE_TZ = "America/New_York";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

const CARD_BEGIN = "<!-- data:match:begin -->";
const CARD_END = "<!-- data:match:end -->";
const EVENTS_BEGIN = "<!-- data:events:begin -->";
const EVENTS_END = "<!-- data:events:end -->";

/* Nickname -> [display name, primary, secondary]. Two flat colours, not
   logos: no artwork is copied, and the chip keeps the flag's 74x50 frame. */
const TEAMS = {
  giants: ["New York Giants", "#0b2265", "#a71930"],
  jets: ["New York Jets", "#125740", "#f2f2f2"],
  cardinals: ["Arizona Cardinals", "#990019", "#ffffff"],
  browns: ["Cleveland Browns", "#311d00", "#ff3c00"],
  saints: ["New Orleans Saints", "#101820", "#d3bc8d"],
  dolphins: ["Miami Dolphins", "#008e81", "#ffffff"],
  raiders: ["Las Vegas Raiders", "#000000", "#a5acaf"],
  commanders: ["Washington Commanders", "#5a2d81", "#ffb612"],
  bills: ["Buffalo Bills", "#00338d", "#c60c30"],
  jaguars: ["Jacksonville Jaguars", "#006778", "#d7a25f"],
  "49ers": ["San Francisco 49ers", "#aa0000", "#b3995d"],
  cowboys: ["Dallas Cowboys", "#003594", "#8d95a0"],
  eagles: ["Philadelphia Eagles", "#004c54", "#000000"],
  steelers: ["Pittsburgh Steelers", "#000000", "#ffb612"],
  ravens: ["Baltimore Ravens", "#241773", "#000000"],
  bengals: ["Cincinnati Bengals", "#fb4f14", "#000000"],
  texans: ["Houston Texans", "#03202f", "#a71930"],
  colts: ["Indianapolis Colts", "#003c8f", "#ffffff"],
  titans: ["Tennessee Titans", "#0c2340", "#4b92db"],
  buccaneers: ["Tampa Bay Buccaneers", "#d50a0a", "#ffffff"],
  falcons: ["Atlanta Falcons", "#a71930", "#000000"],
  panthers: ["Carolina Panthers", "#0085ca", "#000000"],
  packers: ["Green Bay Packers", "#203731", "#ffb612"],
  bears: ["Chicago Bears", "#0b161e", "#c83803"],
  lions: ["Detroit Lions", "#0076b6", "#b0b7bc"],
  vikings: ["Minnesota Vikings", "#4f2683", "#ffc62f"],
  ram: ["Los Angeles Rams", "#003594", "#ffd519"],
  seahawks: ["Seattle Seahawks", "#002244", "#69be28"],
  "cardinals-az": ["Arizona Cardinals", "#990019", "#ffffff"],
  charger: ["Los Angeles Chargers", "#0080c6", "#ffc72c"],
  broncos: ["Denver Broncos", "#002244", "#fbdb9b"],
  chief: ["Kansas City Chiefs", "#e31837", "#ffb81c"],
  patriots: ["New England Patriots", "#002244", "#c60c30"],
  army: ["Army Black Knights", "#000000", "#c99700"],
  navy: ["Navy Midshipmen", "#0a1e3c", "#c60c30"],
};
const NEUTRAL = ["#3f4551", "#c9ccd1"];

const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

async function get(url) {
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "text/html", "accept-language": "en-US" },
    redirect: "follow",
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

function ldBlocks(html) {
  const out = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(m[1]);
      for (const item of Array.isArray(parsed) ? parsed : [parsed]) out.push(item);
    } catch {
      /* a seller page that ships a malformed block is normal; skip it */
    }
  }
  return out;
}

const isEvent = (o) =>
  o &&
  /^(SportsEvent|MusicEvent|Event)$/.test(String(o["@type"])) &&
  typeof o.startDate === "string" &&
  /metlife/i.test((o.location && o.location.name) || o.name || "");

/* TickPick's feed stamps wall-clock kickoffs with a trailing Z, so `new Date`
   would shift them by four hours; and around a DST change the offset differs
   from the one baked into the string. Read the digits back as venue-local
   instead. The venue page carries a real offset, so it needs no correction. */
function zonedWallTime(iso) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return new Date(iso);
  const [, y, mo, d, hh, mm] = m.map(Number);
  const wall = Date.UTC(y, mo - 1, d, hh, mm);
  let ts = wall;
  for (let i = 0; i < 3; i++) {
    const next = wall - tzOffsetMinutes(new Date(ts)) * 60000;
    if (next === ts) break;
    ts = next;
  }
  return new Date(ts);
}

function tzOffsetMinutes(date) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: VENUE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const g = (t) => Number(p.find((x) => x.type === t).value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"), g("second"));
  return (asUtc - date.getTime()) / 60000;
}

const wallTimeOf = (entry) =>
  /[Zz]$/.test(String(entry.startDate))
    ? zonedWallTime(entry.startDate)
    : new Date(entry.startDate);

function parts(when) {
  const d = when;
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: VENUE_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).formatToParts(d);
  const g = (t) => p.find((x) => x.type === t).value;
  const off = new Intl.DateTimeFormat("en-US", {
    timeZone: VENUE_TZ,
    timeZoneName: "longOffset",
  })
    .formatToParts(d)
    .find((x) => x.type === "timeZoneName")
    .value.replace("GMT", "UTC")
    .replace(/UTC([+-])0*(\d{1,2}):(\d{2})$/, (_, s, h, mm) =>
      mm === "00" ? `UTC${s}${h}` : `UTC${s}${h}:${mm}`,
    );
  const slot = [
    new Intl.DateTimeFormat("en-CA", { timeZone: VENUE_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d),
    new Intl.DateTimeFormat("en-GB", { timeZone: VENUE_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d),
  ].join(" ");
  const zp = new Intl.DateTimeFormat("en-US", {
    timeZone: VENUE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  }).formatToParts(d);
  const gz = (t) => zp.find((x) => x.type === t).value;
  const rawOff = gz("timeZoneName").replace("GMT", "");
  // midnight can surface as 24:00 under some ICU hour cycles
  const hh = gz("hour") === "24" ? "00" : gz("hour");
  const localStamp = `${gz("year")}-${gz("month")}-${gz("day")}T${hh}:${gz("minute")}:${gz("second")}${rawOff || "+00:00"}`;
  return {
    weekday: g("weekday"),
    dayMonth: `${g("month")} ${g("day")}`,
    clock: `${g("hour")}:${g("minute")} ${g("dayPeriod").toUpperCase()}`,
    zone: g("timeZoneName"),
    offset: off,
    slot,
    localStamp,
    label: `${g("weekday")} ${g("month")} ${g("day")}, ${g("hour")}:${g("minute")} ${g("dayPeriod").toUpperCase()}`,
    fullLabel: `${g("weekday")} ${g("month")} ${g("day")}, ${g("hour")}:${g("minute")} ${g("dayPeriod").toUpperCase()} ${g("timeZoneName")} (${off})`,
  };
}

function splitMatchup(name) {
  const m = String(name).match(/^(.*?)\s+(?:vs\.?|v\.?|@)\s+(.*)$/i);
  if (!m) return null;
  return { home: m[1].trim(), away: m[2].trim() };
}

const nickOf = (team) => String(team).trim().split(/\s+/).pop().toLowerCase().replace(/[^a-z0-9]/g, "");

function teamOf(nick) {
  return TEAMS[nick] || null;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const now = new Date();

  let official = [];
  let resale = [];
  const notes = [];
  for (const [label, url, sink] of [
    ["official", OFFICIAL_URL, (x) => (official = x)],
    ["resale", RESALE_URL, (x) => (resale = x)],
  ]) {
    try {
      sink(ldBlocks(await get(url)).filter(isEvent));
    } catch (e) {
      notes.push(`${label} feed unavailable: ${e.message}`);
    }
  }
  if (!official.length && !resale.length) {
    console.error("Both feeds failed; nothing written.\n" + notes.join("\n"));
    process.exitCode = 1;
    return;
  }

  const norm = (arr, source) =>
    arr.map((e) => {
      const when = wallTimeOf(e); // the resale feed labels local times with a Z
      const meta = parts(when);
      const matchup = splitMatchup(e.name);
      const price =
        e.offers && (e.offers.lowPrice != null ? e.offers.lowPrice : e.offers.price);
      return {
        source,
        name: String(e.name).replace(/\s+/g, " ").trim(),
        when,
        iso: when.toISOString(),
        status: String(e.eventStatus || "").split("/").pop() || "EventScheduled",
        detailUrl: typeof e.url === "string" ? e.url : "",
        imageUrl: typeof e.image === "string" ? e.image : "",
        offerUrl: (e.offers && e.offers.url) || "",
        price: Number.isFinite(Number(price)) ? Number(price) : null,
        home: matchup ? matchup.home : "",
        away: matchup ? matchup.away : "",
        ...meta,
      };
    });

  const officials = norm(official, "metlifestadium.com");
  const resales = norm(resale, "tickpick.com");

  /* The venue page decides what the card says, but it only lists roughly the
     next month; the resale page runs further out, so its leftovers keep the
     "next ten events" list honest. Same kickoff slot is the join — the two
     sites name concerts differently ("Usher Raymond & Chris Brown" vs
     "Usher & Chris Brown"). */
  const primary = officials.length ? officials : resales;
  const extras = officials.length ? resales : [];
  const bySlot = new Map();

  for (const e of primary) {
    if (e.status === "EventCancelled") continue;
    const twin = extras.find((r) => r.slot === e.slot);
    bySlot.set(e.slot, {
      ...e,
      title: twin && twin.name.length > e.name.length ? twin.name : e.name,
      detailUrl: e.detailUrl || (twin && twin.detailUrl) || "",
      tickpickUrl:
        (twin && twin.source === "tickpick.com" && twin.detailUrl) ||
        (/tickpick/.test(e.source) ? e.detailUrl : ""),
      price: e.price != null ? e.price : (twin && twin.price) ?? null,
      priceSource:
        e.price != null ? e.source : twin && twin.price != null ? twin.source : "",
    });
  }
  for (const r of extras) {
    if (r.status === "EventCancelled" || bySlot.has(r.slot)) continue;
    bySlot.set(r.slot, {
      ...r,
      title: r.name,
      tickpickUrl: r.detailUrl,
      priceSource: r.price != null ? r.source : "",
    });
  }

  const events = [...bySlot.values()].sort((a, b) => a.when - b.when);
  const upcoming = events.filter((e) => e.when >= now);
  const list = (upcoming.length ? upcoming : events).slice(0, 10);

  const game =
    upcoming.find((e) => e.home && e.away && teamOf(nickOf(e.home)) && teamOf(nickOf(e.away))) ||
    (upcoming.find((e) => e.home && e.away) ?? null);

  const snapshot = {
    generatedAt: now.toISOString(),
    venue: "MetLife Stadium",
    city: "East Rutherford, New Jersey, United States",
    timezone: VENUE_TZ,
    sources: { official: OFFICIAL_URL, resale: RESALE_URL },
    notes,
    featured: game ? publicEvent(game) : null,
    events: list.map(publicEvent),
  };

  function publicEvent(e) {
    return {
      name: e.title,
      venueListedAs: e.name,
      home: e.home,
      away: e.away,
      kickoff: e.iso,
      kickoffLocal: e.localStamp,
      when: e.label,
      clock: `${e.clock} ${e.zone} (${e.offset})`,
      venue: `${e.weekday} ${e.dayMonth}`,
      ticketmasterUrl: /ticketmaster\.com|ticketingco\.com/.test(e.offerUrl || "") ? e.offerUrl : "",
      tickpickUrl: e.tickpickUrl,
      detailUrl: e.detailUrl,
      priceFloorUsd: e.price,
      priceSource: e.priceSource,
      source: e.source,
    };
  }

  /* An empty feed must never blank the page: without data the regions keep
     whatever is already committed. */
  const html = await readFile(HTML_FILE, "utf8");
  let nextHtml = html;
  if (game) nextHtml = replaceRegion(nextHtml, CARD_BEGIN, CARD_END, cardMarkup(game));
  if (list.length)
    nextHtml = replaceRegion(nextHtml, EVENTS_BEGIN, EVENTS_END, rowsMarkup(list, now));

  console.log(
    [
      `fetched ${official.length} official + ${resale.length} resale events (${notes.join("; ") || "both feeds ok"})`,
      game
        ? `card  -> ${game.title} @ ${game.fullLabel}`
        : "card  -> no fixture inside the feed window, leaving the card untouched",
      `rows  -> ${list.length} events, ${list.filter((e) => e.price != null).length} with a price floor`,
    ].join("\n"),
  );

  if (dryRun) {
    console.log("\n--- card ---\n" + cardMarkup(game));
    console.log("\n--- rows ---\n" + rowsMarkup(list, now));
    console.log("\n--- json ---\n" + JSON.stringify(snapshot, null, 2));
    return;
  }  await writeFile(JSON_FILE, JSON.stringify(snapshot, null, 2) + "\n");
  if (nextHtml !== html) {
    await writeFile(HTML_FILE, nextHtml);
    console.log("wrote public/match.json + index.html");
  } else {
    console.log("wrote public/match.json (index.html unchanged)");
  }
}

function replaceRegion(html, begin, end, inner) {
  const i = html.indexOf(begin);
  const j = html.indexOf(end);
  if (i === -1 || j === -1 || j < i) {
    throw new Error(`Missing markers ${begin} .. ${end} in index.html`);
  }
  /* the old region's last line carried the end marker's indentation, so re-apply
     whatever the begin marker is indented with */
  const indent = html.slice(html.lastIndexOf("\n", i) + 1, i);
  const head = html.slice(0, i + begin.length);
  const tail = html.slice(j);
  return head + "\n" + inner.replace(/\s*$/, "\n") + indent + tail;
}

function flagMarkup(team) {
  const known = teamOf(nickOf(team));
  const [, c1, c2] = known || [team, ...NEUTRAL];
  const label = known ? known[0] : team;
  return `        <div class="team">
          <div class="flag club" style="--c1:${c1};--c2:${c2}" role="img" aria-label="${esc(label)} colors"></div>
          <div class="name">${esc(team.toUpperCase())}</div>
        </div>`;
}

function cardMarkup(game) {
  if (!game) return "";
  const homeNick = game.home.split(/\s+/).pop();
  const awayNick = game.away.split(/\s+/).pop();
  /* the seat price bands scale off this, so the card has to carry the floor */
  const floor =
    game.price != null && Number.isFinite(Number(game.price))
      ? ` data-price-floor="${Math.round(Number(game.price))}"`
      : "";
  return `    <section id="match" class="card"${floor} aria-label="Next game at MetLife Stadium">
      <div class="eyebrow">NEXT GAME AT METLIFE</div>
      <div class="teams">
${flagMarkup(homeNick)}
        <div class="vs">VS</div>
${flagMarkup(awayNick)}
      </div>
      <div class="meta">
        <div class="row">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M8 3v4M16 3v4M3 10h18" /></svg
          >${esc(`${game.weekday} ${game.dayMonth}, ${game.clock} ${game.zone} (${game.offset})`)}
        </div>
        <div class="row">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" />
            <circle cx="12" cy="10" r="2.6" /></svg
          >MetLife Stadium, New Jersey, United States
        </div>
      </div>
    </section>
    <!-- feed: ${game.source}, kickoff ${game.iso} -->
`;
}

function rowsMarkup(list, now) {
  const rows = list
    .map((e) => {
      const href = e.tickpickUrl || e.offerUrl || e.detailUrl;
      if (!href) return "";
      const sponsored = /tickpick/i.test(href) ? ' rel="sponsored nofollow noopener"' : ' rel="noopener noreferrer"';
      return `          <a class="visit-row" href="${esc(href)}" target="_blank"${sponsored}><span class="when">${esc(e.label)}</span>${esc(e.title)}${
        e.price != null ? `<span class="price">from $${e.price}</span>` : ""
      }</a>`;
    })
    .filter(Boolean)
    .join("\n");
  const stamp = now.toISOString().slice(0, 10);
  return `        <div class="visit-rows">
${rows}
        </div>
        <p class="support-note">
          Event list and floors read from the venue’s published listings,
          refreshed ${stamp}. StadiView doesn’t sell tickets — these links go to
          the sellers.
        </p>
`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

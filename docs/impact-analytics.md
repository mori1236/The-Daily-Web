# Impact Analytics

Editors open `/editor/analytics` from the shared workspace sidebar. The page uses
EJS for its shell, Vanilla JavaScript and `fetch` for interaction, and a responsive
Canvas chart. No external chart scripts or new dependencies are required.

## Data collection

A view is a successfully served `GET /articles/:id` response. Repeated requests,
including bots, count as views. HEAD requests, missing articles and failed renders
do not count. This measures page responses, not unique readers, reading completion,
time spent reading, or shares. Article content remains in the initial server HTML.

`ArticleView` stores minute counters in a separate collection:

```text
_id: articleId:UTC-minute-timestamp:stripe
article: ObjectId
minute: Date (UTC minute boundary)
stripe: integer in [0, 15] for live traffic; 16 for backfilled demo traffic
count: integer
```

Every response increments one randomly chosen stripe using atomic `$inc` and
upsert. A deterministic unique `_id` prevents duplicate counters; an insert race
is retried as an increment. Sixteen independent counters reduce contention on a
popular article's current minute. Storage grows with active article/minute pairs,
not the number of readers. No reader IDs, IP addresses or per-view documents are
stored. The `{ article: 1, minute: 1 }` index serves time-range queries.

The existing `Article.viewCount` remains the lifetime counter used by popularity
sorting. It is updated separately after the minute counter. These two writes are
not a transaction: a failure between them can make the lifetime counter lag the
timeline. Errors are logged; there is no durable retry queue or exactly-once
delivery guarantee. Recording runs after the response finishes so an analytics
failure cannot prevent reading an article. Abrupt process termination can lose an
in-flight analytics write. A production deployment needing stronger delivery
guarantees should introduce a durable queue and idempotent event processing.

This implementation avoids process-local batched counters, which would be lost
on restart and would diverge across multiple Express instances. Lifetime counter
writes still share one article document; sustained production throughput should
be load-tested on the deployment's actual MongoDB hardware.

## Graph and comparisons

`Article.publishEvents` already records each editor-approved publication. The
first is the initial publication and subsequent events are updates. The analytics
API returns their original timestamps and editor names independently of graph
bins, so the blue markers are placed at the actual approval time.

The graph shows **views per interval**, not cumulative views: 5-minute bins for
24 hours, 30-minute bins for 7 days and 2-hour bins for 30 days. MongoDB first sums
the stripes per minute within the indexed range; the controller then prepares a
bounded series (at most 361 points). Missing minutes after tracking started count
as zero. Periods before `viewTrackingStartedAt` are marked as untracked, not zero.
The current graph interval may be incomplete.

For a chosen update, comparison windows cover up to 60 complete minutes before
and after approval, bounded by the selected range, tracking start, current time
and adjacent publications. A minute containing an approval partway through it is
excluded from the comparison. For an update at exactly 14:00, the normal windows
are 13:00–14:00 and 14:00–15:00. Rates are views/minute so unequal observation
durations are not compared as raw totals. With insufficient data the UI reports
that; if the before rate is zero there is no percentage change. Comparisons are
descriptive and do not establish that an update caused a change in traffic.

Historical lifetime totals cannot be reconstructed into timed views. Old articles
keep their totals and publication history; their timeline starts with new visits.
The optional development seed backfills 24 hours of simulated minute views for
published articles created by the original seed (identified by its demo content
or `daily-web-<number>` image URL). Their content, states and publication events
are preserved, existing lifetime totals are retained, and live minute counters
are not overwritten. Historical demo traffic uses stripe 16. Unpublished drafts
and non-seed articles are left alone. It also adds four explicitly marked demo
articles with 20 hours of minute counters and three updates each.
Scenario keys and insert-only counter upserts make repeated
seeding safe. Run `npm run seed:analytics` to add these fixtures to an existing
database; the regular `SEED_DEMO_DATA=true` startup also adds them.

## REST endpoints

All endpoints require the existing editor role guard:

- `GET /editor/analytics?article=<id>&range=24h`: initial EJS page.
- `GET /api/editor/analytics/articles?q=<title>`: all matching published article
  IDs and titles. The picker includes every published article on the initial render.
- `GET /api/editor/articles/:id/analytics?range=24h`: summary, time bins,
  publication events and before/after comparisons. Ranges: `24h`, `7d`, `30d`, `all`.
  Creation and latest approved update dates and the full publication history are
  returned independently of the chart range. `all` starts at first publication
  and adjusts the bin size to keep the chart bounded.

The UI polls every 30 seconds while visible, cancels superseded requests, supports
keyboard selection of publication events, and provides a data table and CSV
export. Chart times use `Asia/Jerusalem`; CSV timestamps use ISO UTC.

## Verification

`npm test` covers aggregation formatting, whole-minute comparison boundaries,
missing historical data, zero baselines, insert-race retries, validation, and role
authorization, as well as the existing sanitizer/feed tests.

An optional integration test uses a newly generated **separate temporary database**
on a local MongoDB instance, then drops only that test database:

```powershell
$env:RUN_ANALYTICS_DB_TEST = 'true'
node --test server/controllers/analytics-db.test.js
Remove-Item Env:RUN_ANALYTICS_DB_TEST
```

It verifies 1,000 simultaneous views without lost increments and the real MongoDB
aggregation and before/after comparisons. It never rewrites the configured app database.

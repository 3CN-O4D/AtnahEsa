import assert from 'node:assert/strict'
import {
  buildHouseSearchOutput,
  extractRentRange,
  extractRequestedCount,
  parseHouseQuery,
  type RawListing,
} from '../src/lib/chat/houseSearch'

function listing(id: string, location: string, rent: number, overrides: Partial<RawListing> = {}): RawListing {
  return {
    id,
    title: `House ${id}`,
    location,
    descriptive_location: `${location}, Eldoret`,
    rent,
    price: rent,
    house_type: '1BR',
    building_type: null,
    water: 'included',
    deposit: null,
    deposit_refundable: false,
    vacancy: 'vacant',
    status: 'published',
    images: [],
    issues_count: 0,
    created_at: null,
    ...overrides,
  }
}

const juniorate = Array.from({ length: 8 }, (_, i) =>
  listing(`j${i + 1}`, 'Juniorate', 12000 + i * 1500)
)
const kapsoya = Array.from({ length: 6 }, (_, i) =>
  listing(`k${i + 1}`, 'Kapsoya', 18000 + i * 2000)
)
const raw = [...juniorate, ...kapsoya]

// --- pure query parsing ---------------------------------------------------
assert.deepEqual(extractRentRange('under 15k'), { min: null, max: 15000 })
assert.deepEqual(extractRentRange('10k to 20k'), { min: 10000, max: 20000 })
// "2 bedroom" is a room count, not a budget.
assert.deepEqual(extractRentRange('find 2 bedroom under 15k'), { min: null, max: 15000 })

assert.equal(extractRequestedCount('send me 2 houses in kapsoya'), 2)
assert.equal(extractRequestedCount('one in juniorate'), 1)
assert.equal(extractRequestedCount('find 2 bedroom in juniorate under 15k'), null)
assert.equal(extractRequestedCount('find me cheapest house in juniorate'), null)

const cheapest = parseHouseQuery('find me cheapest house in juniorate')
assert.equal(cheapest.sort, 'price_asc')
assert.ok(cheapest.locations.includes('juniorate'))
assert.equal(cheapest.count, null)

// --- exact counts, no spam ------------------------------------------------
const two = buildHouseSearchOutput(raw, 'send me 2 houses in kapsoya')
assert.equal(two.cards.length, 2, 'must send exactly the two requested houses')
assert.equal(two.snapshot.pageSize, 2)
assert.equal(two.snapshot.shown, 2)
assert.ok(two.cards.every((c) => /kapsoya/i.test(`${c.location} ${c.descriptive_location}`)))

const one = buildHouseSearchOutput(raw, 'one in juniorate')
assert.equal(one.cards.length, 1, 'must send exactly one house')
assert.equal(one.snapshot.pageSize, 1)
assert.ok(/juniorate/i.test(`${one.cards[0].location} ${one.cards[0].descriptive_location}`))

// --- cheapest is ranked, and the default batch stays at five --------------
const ranked = buildHouseSearchOutput(raw, 'find me cheapest house in juniorate')
assert.equal(ranked.cards.length, 5, 'default must stay capped at five')
assert.equal(ranked.total, 8, 'all juniorate houses stay available via show more')
assert.equal(ranked.cards[0].rent, 12000, 'cheapest must come first')
assert.deepEqual(
  ranked.cards.map((c) => c.rent),
  [12000, 13500, 15000, 16500, 18000]
)
assert.equal(ranked.snapshot.pageSize, 5)
assert.equal(ranked.snapshot.filters.sort, 'price_asc')

// Requesting ten is allowed but never exceeds the hard cap.
const ten = buildHouseSearchOutput(raw, 'show me 10 houses in juniorate')
assert.equal(ten.snapshot.pageSize, 10)
assert.equal(ten.cards.length, 8, 'cannot send more houses than exist')

console.log('HOUSE_SEARCH_OK')

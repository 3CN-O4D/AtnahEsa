import assert from 'node:assert/strict'
import { parseOrdinal, selectListingChoice } from '../src/lib/chat/engine'
import { emptyState, type ChatState, type HouseCardData } from '../src/lib/chat/types'

function card(
  id: string,
  title: string,
  overrides: Partial<HouseCardData> = {}
): HouseCardData {
  return {
    id,
    title,
    location: 'Juniorate',
    rent: 10000,
    price: 1000,
    badges: [],
    ...overrides,
  }
}

const choices = [
  card('j1', 'Clean Bedsitter in Juniorate, Eldoret', { water: 'included' }),
  card('j2', '1 Bedroom In juniorate', { house_type: '1BR', water: 'included' }),
  card('k1', 'Furnished bedsitter in Kapsoya', { location: 'Kapsoya', water: 'pay separately' }),
  card('j3', 'Spacious Bedsitter near RVTTI', { water: 'pay separately' }),
]

function stateWithRefs(): ChatState {
  return {
    ...emptyState(),
    search: {
      query: 'available houses',
      filters: { locations: [], bedrooms: [], rent: { min: null, max: null }, sort: 'relevance', count: 4 },
      total: 8,
      results: choices.map((card, i) => ({ card, score: 1, rent: card.rent + i })),
      shown: choices.length,
      pageSize: choices.length,
      capturedAt: new Date().toISOString(),
    },
    messageRefs: [
      { id: 'text-1', kind: 'text', body: 'I found 4 matching houses' },
      ...choices.map((card, i) => ({
        id: `card-${i + 1}`,
        kind: 'card' as const,
        listingId: card.id,
        title: card.title,
        index: i + 1,
        body: card.title,
      })),
    ],
  }
}

const state = stateWithRefs()

assert.equal(parseOrdinal('The first'), 1)
assert.equal(parseOrdinal('#2'), 2)
assert.equal(parseOrdinal('3rd one'), 3)
assert.equal(parseOrdinal('last one'), -1)
assert.equal(parseOrdinal('1 bedroom in Juniorate'), null, 'bedroom count is not an ordinal')

assert.equal(selectListingChoice('The first', state)?.listingId, 'j1')
assert.equal(selectListingChoice('#2', state)?.listingId, 'j2')
assert.equal(selectListingChoice('show me all photos for the second house', state)?.listingId, 'j2')
assert.equal(selectListingChoice('tell me about this house', state)?.listingId, 'j3')
assert.equal(selectListingChoice('the last one', state)?.listingId, 'j3')
assert.equal(selectListingChoice('the 1 bedroom in Juniorate', state)?.listingId, 'j2')
assert.equal(selectListingChoice('the 1BR with water included', state)?.listingId, 'j2')
assert.equal(selectListingChoice('the one after the Kapsoya one', state)?.listingId, 'j3')
assert.equal(selectListingChoice('send me 2 houses in kapsoya', state), null)
assert.equal(selectListingChoice('find a house in Eldoret', state), null)

console.log('LISTING_SELECTION_OK')
